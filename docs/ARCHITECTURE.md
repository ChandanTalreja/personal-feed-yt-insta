# TUBEBOX — Architecture & Decision Record

> A personal, distraction-free YouTube feed with AI comprehension tools.
> This document is the elaborate internal record: what exists, why it was
> built that way, and what comes next. The [README](../README.md) is the
> short public version; this is the engineering memory.

Last updated: 2026-07-03 (pre-first-commit).

---

## 1. Vision & guiding principles

The product goal: watch only the channels you chose, chronologically, with
zero recommendations — plus AI tools (summaries, Q&A, transcripts) that help
decide *whether* and *how* to watch. Personal-scale, $0/month, open-sourceable
(all secrets are user-supplied env vars).

The principles every feature follows:

1. **Own the data; providers are sync sources.** Postgres is the system of
   record. YouTube is only where new rows come from. Old videos never
   disappear; features like notes/transcripts are possible because we keep
   our own copy.
2. **Idempotency everywhere.** Every write is an upsert keyed on a natural
   unique id (`yt_video_id`). Crons can overlap, backfills can re-run,
   retries are always safe.
3. **The cheapest API call is the one you never make.** Everything computed
   (transcripts, summaries, answers) is cached in the DB forever. The
   expensive path runs at most once per video.
4. **Third-party quotas are first-class design constraints.** Self-tracked
   usage ledger, model fallback chain, watch-length caps.
5. **Graceful degradation over hard dependency.** The one unofficial
   dependency (caption fetching) fails to `null`, never to an error — the
   system falls back to a costlier official path.
6. **Config over code.** Genres, ask-presets, model chains, caps, backfill
   window: all data or env vars, changeable without a deploy.
7. **Stateless queries over derived state.** Where a number is displayed
   (badges), its definition must match what the click reveals, and it is
   recomputed from the source of truth, never adjusted client-side.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | Full-stack in one repo; server components for auth-gated pages; route handlers as the API layer |
| Hosting | Netlify (free tier) | Native scheduled functions (no daily-only cron limit like Vercel Hobby; no GitHub Actions dependency) |
| Database | Neon Postgres (prod) / PGlite embedded (local, zero-setup, auto-created in `.data/`) | Free tiers; PGlite makes `npm run dev` work with no accounts |
| ORM | Drizzle | Type-safe, lightweight, same code for both drivers |
| Video data | YouTube Data API v3 (official) | 10,000 free units/day; we use ~1% |
| Captions | YouTube InnerTube (ANDROID client) — unofficial | See §6; degrades gracefully |
| AI | Gemini API (free tier), model fallback chain | User-supplied key; see §7 |
| Styling | Tailwind 4 + custom neobrutalist CSS (`app/globals.css`) | Chunky borders, hard shadows, cursor-tracking TV mascot |

Deliberately **not** used: scraping/proxy services (the MonitorYT approach —
wrong problem class for personal scale), Vercel cron (daily-only on free),
GitHub Actions (was plan A for cron; Netlify scheduled functions replaced it).

---

## 3. System overview

```
Browser (Next.js UI: feed grid, cards, ask/transcript panels)
   │  fetch + auth cookie
   ▼
API route handlers (app/api/**)  ◄── Netlify scheduled fn (every 6h, CRON_SECRET)
   │
   ├── Ingest engine (lib/ingest.ts + lib/youtube.ts)  ──► YouTube Data API
   ├── Gemini engine (lib/gemini.ts)                   ──► Gemini models (chain)
   └── Caption fetcher (lib/transcript.ts)             ──► InnerTube (unofficial)
   │
   ▼
Postgres (lib/db.ts, lib/schema.ts): channels, videos, genres,
video_notes, gemini_usage — compute once, cache forever
```

Layering rule: UI never calls providers; routes contain no business logic;
lib engines know nothing about HTTP.

---

## 4. Data model (`lib/schema.ts`)

- **genres** — id, name (unique), color, `ask_prompt` (nullable — the single
  optional suggested question for this genre's Ask panel; set on Interview,
  null elsewhere), created_at.
- **channels** — id, yt_channel_id (unique), handle, title, thumbnail,
  uploads_playlist_id, genre_id (FK, SET NULL), is_active, added_at.
  `is_active=false` pauses fetching without losing history.
- **videos** — id, yt_video_id (unique — the idempotency key), channel_id
  (FK, CASCADE), title, thumbnail, duration_seconds, is_short, is_live,
  published_at, watched, summary (cached), `transcript` (cached — captions
  text or Gemini transcription), fetched_at.
- **video_notes** — saved Ask answers: video_id (FK, CASCADE), prompt,
  answer, model, source, created_at. Strictly per-video by design decision
  (questions are video-specific; the only cross-video suggestion mechanism
  is the genre's ask_prompt).
- **gemini_usage** — one row per Gemini API call: model, tokens, used_at.
  The app's own quota ledger (Google's API does not expose remaining quota).

Schema management: `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN
IF NOT EXISTS` statements run once per process on first DB use (lib/db.ts).
No migration tooling needed at this scale; `drizzle-kit push` remains
available. **Note:** a failed init is not cached (the promise resets), but a
*successful* init is cached per process — schema changes require a server
restart to apply.

---

## 5. Ingestion pipeline

**Adding a channel** (`POST /api/channels`):
1. `resolveChannel(input)` accepts URLs, @handles, raw UC… ids, or plain
   names. Exact identifiers go straight to `channels.list` (1 unit). Plain
   names fall back to `search.list` (100 units) → the UI then shows a
   **"Found: X — is this the one?" confirmation** before anything is saved
   (typos resolve fuzzily; a wrong guess would otherwise silently backfill
   a stranger's channel). Exact inputs skip confirmation.
2. On confirm, the channel row is inserted and **backfilled**: walk the
   channel's uploads playlist newest-first (50/page, 1 unit/page) until
   older than `BACKFILL_MONTHS` (default 6), fetch details in batches of 50
   (`videos.list`: duration, liveStreamingDetails), insert with
   `onConflictDoNothing`.
3. **Shorts detection**: for videos ≤ ~3 min, one HEAD request to
   `youtube.com/shorts/<id>` — 200 = Short, redirect = regular. Stored once
   in `is_short`.
4. Live streams: upcoming/in-progress broadcasts are skipped (picked up as
   VODs on a later run); finished streams get `is_live=true` and a STREAM
   badge.

**Cron** (`GET /api/cron`, guarded by `x-cron-secret` header or auth cookie):
for each active channel, ingest uploads from a 14-day lookback window —
overlap is free because of the unique-key dedup. Triggered every 6 hours by
`netlify/functions/feed-cron.mts` (schedule in the file's exported config),
or manually via the REFRESH button.

Quota math: ~2 units/channel/run × 11 channels × 4 runs/day ≈ 90 of 10,000
daily units. Mass-adding channels with backfill: ~5 units each (plus 100 if
name-searched). Effectively unlimited headroom at personal scale.

---

## 6. Transcripts & the InnerTube caption route (the "unofficial door")

**History:** YouTube locked the classic caption downloads in ~2025 — the
watch-page `captionTracks` URLs and browser timedtext endpoints now return
empty bodies without a browser proof-of-origin ("pot") token, and
`get_transcript` requires preconditions we can't satisfy server-side.

**What works (lib/transcript.ts):** POST to
`youtube.com/youtubei/v1/player` identifying as the **ANDROID client**
(clientName ANDROID, clientVersion 20.x). Its response still includes
working caption URLs (kept alive because old YouTube Android apps depend on
it). One POST + one GET per video; parses json3 or srv3 XML; result capped
at 150K chars.

**Risk posture:** this can break any day. It returns `null` on *any*
failure, and every caller treats `null` as "no captions" → falls back to the
official Gemini watch path (§7). Breakage changes cost, not correctness.
**Detection signal:** if new transcripts' `source` flips from "captions" to
"video" across the board, the door has closed.

---

## 7. The Gemini engine (`lib/gemini.ts`)

All three AI features (Summary, Ask, Transcript) run through one engine:

**Step 1 — get the video as text, cheapest first:**
1. Cached `videos.transcript` → free.
2. InnerTube captions (§6) → ~0 tokens, cached to the video row.
3. **Watch-once**: Gemini watches the video with `videoMetadata.fps = 0.1`
   (1 frame per 10s) + `mediaResolution: LOW` ≈ **~40 tokens/second** (vs
   ~300 at defaults) — an hour of footage fits one free-tier request. Its
   task during that watch is to *transcribe*; the transcript is cached, so
   the expensive watch happens **at most once per video, ever**. Capped at
   `GEMINI_WATCH_MAX_MINUTES` (default 90) with a friendly error beyond.

**Step 2 — answer from text:** summary/ask/transcript-formatting are then
small text-only calls (~5–15K tokens even for hour-long transcripts).

**Model selection:** `GEMINI_MODELS` env — `"model:rpd,model:rpd,…"`
(default `gemini-3.1-flash-lite:500,gemini-2.5-flash:20,
gemini-2.5-flash-lite:20,gemini-3.5-flash:20`; `GEMINI_MODEL` forces one to
the front). Before each call, models are ranked by **remaining daily
budget** = configured RPD − today's rows in `gemini_usage` (UTC midnight
reset — approximates Google's Pacific reset; worst case a 429 walks the
chain). Quota/unknown-model errors advance to the next model; content
errors (unavailable video) abort immediately to avoid burning the chain.
Every successful call records model + total tokens.

**Free-tier facts learned the hard way:** TPM (250K) is a per-minute *speed
limit*, not a budget — the AI Studio dashboard shows the 28-day *peak*, not
live usage. RPD is the real budget. Default-resolution video ≈ 300
tokens/sec (a 10-min video ≈ 180K tokens — nearly the whole per-request
window); that's why fps+resolution tuning matters.

---

## 8. Features (user-facing behavior)

- **Feed**: reverse-chronological grid; genre tabs (colored, user-defined);
  VIDEOS / SHORTS kind tabs; INBOX (unwatched, default) / EVERYTHING /
  HISTORY. Playing opens an embedded `youtube-nocookie` player and
  auto-marks watched; MARK SEEN toggles manually. No view counts anywhere —
  deliberate anti-distraction choice.
- **Channel chips** (below tabs, shown when the active genre has ≥2
  channels): multi-select toggle filter; switching genre clears the channel
  selection (outer filter resets inner refinement — prevents silently empty
  feeds). **Badges = total items stored for the active tab's kind**
  (VIDEOS tab → video count, SHORTS tab → shorts count). Stable numbers
  that only grow with new uploads; deliberately independent of
  watched-state after the "moving numbers are confusing" lesson. The badge
  always matches what clicking the chip reveals.
- **✨ SUMMARY**: 3–5 bullets + "Worth watching if:", cached on the video.
- **💬 ASK**: free-text question about the video's content; answers saved
  per-video forever (a revision notebook that survives refreshes);
  re-asking the same question (case-insensitive) returns the cached answer
  free. If the video's genre has an `ask_prompt`, it appears as the single
  preset chip (currently only Interview: "List all the questions asked in
  this video"). No global/hardcoded presets — removed by design.
- **📄 TEXT**: full transcript (captions when available — instant and free;
  Gemini transcription otherwise), timestamps at topic changes.
- **Manage page**: add channel (URL/@handle/name + confirmation flow),
  genre editor (color, ✎ suggested-question editor, delete), per-channel
  genre assignment, ACTIVE/PAUSED toggle, DELETE (cascades to videos).
- **Manage page repair tool — RE-SYNC** per channel: re-runs the full
  backfill window (heals holes from interrupted backfills, which the
  cron's 14-day lookback never would). Idempotent, safe anytime.
- **Auth**: single `APP_PASSWORD` env → sha256 cookie (httpOnly,
  SameSite=Lax), 30 days. Unset = open (local dev). All routes check it;
  `/api/cron` alternatively accepts `CRON_SECRET`. Login is protected by
  **rate limiting** (max 5 failed attempts per IP per 15 min, tracked in
  the `login_attempts` table — Postgres is the shared state across
  serverless instances) and a **constant-time password comparison**
  (sha256 both sides + `timingSafeEqual`). CSRF: mitigated by
  SameSite=Lax + the "never mutate on GET" rule; XSS: React escaping, no
  `dangerouslySetInnerHTML` anywhere; SQLi: parameterized queries via
  Drizzle. Accepted residual risk: a determined request flood can exhaust
  free-tier function invocations (edge-level protection would need a paid
  WAF or Cloudflare in front) — monitor via Netlify usage notifications.

---

## 9. Gotchas & fixes discovered (keep for debugging)

- **`yt3.ggpht.com` avatars 429 when the request carries a Referer header**
  (Google anti-hotlinking). Fix: `referrerPolicy="no-referrer"` on all
  avatar/thumbnail `<img>` tags. Video thumbs (`i.ytimg.com`) are immune.
- **Turbopack persistent cache can serve stale CSS** after editing
  `globals.css` — if a style change refuses to appear even after restart,
  `rm -rf .next`.
- **PGlite requires its parent directory to exist** (`mkdir recursive`
  before instantiating) and a failed DB init must not be cached.
- **React hooks lint (`set-state-in-effect`)** flags async data fetching in
  effects; targeted eslint-disable with a comment is the accepted pattern.
- **Netlify function timeouts** (~10–26s free tier) are shorter than a
  long watch-once call (~60s). Mitigated for most content by the captions
  path being instant; a truly caption-less long video may time out on the
  deployed site (works locally). Escape hatches if it bites: background
  functions, or accepting transcript-only for those.
- **CSS cascade vs Tailwind utilities**: custom classes in `globals.css`
  are emitted after Tailwind's utilities, so `bg-[...]` loses to a custom
  class's background — color modifiers (`.nb-btn-pink`, `.nb-danger`) must
  be declared *after* the base classes.

---

## 10. Environment variables (complete reference)

| Var | Required | Purpose |
|---|---|---|
| `YOUTUBE_API_KEY` | yes | Official Data API (channel resolve, uploads, details) |
| `DATABASE_URL` | prod only | Neon Postgres; unset locally → embedded PGlite in `.data/` |
| `APP_PASSWORD` | deploy | Single-user login; unset = open |
| `CRON_SECRET` | deploy | Shared secret for the scheduled function → `/api/cron` |
| `GEMINI_API_KEY` | for AI features | aistudio.google.com |
| `GEMINI_MODELS` | no | Fallback chain `"model:rpd,…"` (see §7 default) |
| `GEMINI_MODEL` | no | Force one model to the chain's front |
| `GEMINI_WATCH_MAX_MINUTES` | no | Watch-once cap for caption-less videos (default 90) |
| `GEMINI_DAILY_LIMIT` | no | App-level cap on total Gemini calls/day across all models (default 100) |
| `BACKFILL_MONTHS` | no | History pulled when adding a channel (default 6) |
| `PGLITE_DIR` | no | Local embedded DB location (default `.data/pglite`) |

## 11. Deploy checklist (Netlify — not yet done)

1. Push repo to GitHub (secrets live only in `.env.local`, which is
   gitignored; `.env.example` documents the shape).
2. Netlify → Import project (Next.js runtime auto-detected;
   `netlify.toml` is minimal on purpose).
3. Set env vars: `YOUTUBE_API_KEY`, `DATABASE_URL` (Neon), `APP_PASSWORD`,
   `CRON_SECRET` (`openssl rand -hex 24`), `GEMINI_API_KEY`, and
   `GEMINI_MODEL=gemini-3.1-flash-lite` (matches local).
4. Deploy; tables self-create on first request. The scheduled function
   (`netlify/functions/feed-cron.mts`) runs every 6h automatically.
5. Watch the first cron run's function logs once.

## 12. Roadmap

**Hardening batch — BUILT 2026-07-03:** `GEMINI_DAILY_LIMIT` app-level
daily cap; RE-SYNC button per channel; login rate limiting +
constant-time compare; friendlier errors (daily budget, video
unavailable/restricted, watch-length cap).

**Ideas parked:**
- Read-only public demo mode (visitors browse, can't mutate) — for
  "show people the project" without sharing the password.
- Auth: APP_PASSWORD is correct for single-user; if ever multi-user, use
  Auth.js (NextAuth) inside the app — portable across hosts — not
  platform-tied auth (Netlify Identity was deprecated then un-deprecated
  Feb 2026; the saga itself is the lock-in lesson).
- Split model chains (text vs video) so text-only models (Gemma) could
  serve summaries/asks as extra capacity; unnecessary at current headroom.
- Transcript chunking (startOffset/endOffset map-reduce) for caption-less
  videos beyond 90 min.
- Lifetime channel stats on the manage page (official `statistics`).
- Audio digest of the feed (TTS models). Instagram: parked indefinitely
  (no viable free/compliant path).

**Process notes:** discussion-first, then code; owner is learning Next.js +
system design through this project — explain architectural reasoning with
implementations. First commit: pending (owner does it).
