# TUBEBOX — Architecture & Decision Record

> A personal, distraction-free YouTube feed with AI comprehension tools.
> This document is the elaborate internal record: what exists, why it was
> built that way, and what comes next. The [README](../README.md) is the
> short public version; this is the engineering memory.

Last updated: 2026-09-04.

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

### 3.1 UI layer (how the screens are built)

The look is documented in [REDESIGN.md](REDESIGN.md) §2; this is the code.

- **Pages** (`app/*/page.tsx`) check the login on the server, then render one
  client component per screen. Each screen's own parts live in its folder:
  `components/feed/` (feed, sidebar, card, study panel, track menu, and
  `useFeedData` — the loaded pages plus the counts kept in step by ✓,
  bookmark and progress), `components/notebook/`, `components/tracks/`,
  `components/channels/`. A folder's `model.ts` holds its types and pure
  rules (e.g. a channel's "quiet" status, a track's summary line).
- **Shared** at the top of `components/`: `TopBar` (with `GlobalSearch`),
  `PlayerModal`, `NoteEditor`, `CopyButton`, `Markdown`, `types.ts` and
  `useAsk` (the Ask flow used by the study panel and the Notebook).
- **Building blocks** in `components/ui/`: `Button` (with `busy`),
  `IconButton`, `Icon` (Phosphor shapes in `iconPaths.ts`), `SearchField`,
  `SegmentedControl`, `SidebarList`, `SidePanel`, `PageTitle`, `EmptyState`,
  `Spinner`, `Media` (`Thumb`/`Avatar` — the only place images are drawn,
  with the `no-referrer` rule YouTube's avatar host needs), and hooks
  `useDismiss` (menus) and `useCopy` (clipboard).
- **Design tokens** live only in `app/globals.css` `@theme`, which first
  clears Tailwind's own colours, sizes and corners — so only the design
  system's values exist as classes.
- **Talking to the API:** screens call `api()` (`lib/api-client.ts`): JSON
  in, JSON out, the server's `{ error }` message on failure. Routes start
  with `denyUnlessAuthed()` (`lib/auth.ts`) and read ids with `parseId()`
  (`lib/http.ts`; a bad id gets 400, not a crash).
- **Routes the screens use** (beyond the core feed/AI ones): `GET /api/nav`
  (top-bar counts + last sync), `GET /api/search?q=` (channels, videos,
  answers and notes in one parallel round trip; ILIKE + trigram; `@` =
  channels only), `GET /api/videos` also returns `facets` (sidebar counts,
  first page) and each video's `answerCount`, `GET /api/videos/:id`,
  `GET /api/channels` with `lastUploadAt` and counts,
  `POST /api/channels/bulk` (move/pause/resume/delete in one statement),
  `POST /api/channels/:id/backfill` (page by page with a cursor, under
  Netlify's 10 s), `GET/PUT /api/ask-suggestions`.
- **Links between screens:** global search opens `/?channel=`, `/?video=`,
  `/?q=` (the feed applies them, then tidies the address to `/`) and
  `/notebook?v=`; the Notebook and Tracks keep the open item in `?v=` /
  `?t=`; `/manage` forwards to `/channels` (`next.config.ts`).
- **Instant revisits** (PERF-03): `api()` remembers each GET reply in the
  tab's memory (capped, browser only); screens start from
  `rememberedReply(path)` and refresh in the background. Any change through
  `api()` or a sync clears it; the feed's ✓/bookmark/progress update it in
  place. `next.config.ts` `staleTimes.dynamic: 300` reuses a visited page for
  5 min instead of re-requesting it.
- **Counts stay fresh** without polling: screens fire the
  `tubebox:nav-changed` event (`lib/nav-events.ts`) after a change, and the
  top bar recounts once (debounced).

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
  text or Gemini transcription), `later_at` (Watch later; null = not saved),
  `watch_progress` (played 10-second chunks as a "0/1" string) and
  `resume_seconds` (honest watched, `lib/progress.ts`), `last_played_at`
  (stamped by every progress save — not by a hand-ticked ✓; feeds a track's
  "last watched"), `personal_note` + `personal_note_at` (your one note per
  video), fetched_at.
- **video_notes** — saved Ask answers: video_id (FK, CASCADE), prompt,
  answer, model, source, created_at. Strictly per-video by design decision
  (questions are video-specific; the only cross-video suggestion mechanism
  is the genre's ask_prompt).
- **gemini_usage** — one row per Gemini API call: model, tokens, used_at.
  The app's own quota ledger (Google's API does not expose remaining quota).
- **login_attempts** — ip, attempted_at: the login rate limit (5 per 15 min
  per IP).
- **app_meta** — key/value pairs for small app-wide settings: `last_sync_at`
  (written by every sync, for "Synced 3h ago") and `ask_suggestions` (your
  everyday Ask questions). Three strings didn't need their own tables.
- **tracks** — id, name (unique), created_at. **track_videos** — track_id,
  video_id (both FK, CASCADE), position, added_at; the (track, video) key
  makes adding idempotent.

Indexes beyond the unique keys: `videos(published_at DESC)`, a trigram index
on `videos.title` (search), `videos(later_at)` for saved ones,
`video_notes(video_id)` (answer counts), `track_videos(video_id)`,
`login_attempts(ip, attempted_at)`.

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
   older than the **chosen backfill window** — the add-channel form's
   "how far back" picker (1 year default, up to 5; sent as `years`, clamped
   server-side to 1–60 months by `resolveBackfillMonths`), falling back to
   `BACKFILL_MONTHS` (default 12) when unset. Fetch details in batches of 50
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

**Datacenter block (discovered on deploy):** YouTube refuses this route
from cloud-provider IPs (Netlify/AWS) while allowing residential IPs — the
same wall MonitorYT's creator hit (he solved it with paid Decodo proxies at
product scale). Our hosted fallback: an **Apify transcript Actor**
(`starvibe~youtube-video-transcript`, ~$0.005/video, ~5s, inside Apify's
permanently recurring $5/month free credit), called via
`run-sync-get-dataset-items` only when `APIFY_TOKEN` is set — i.e. never in
local dev. Verified: clean punctuated transcripts, better than raw
InnerTube fragments.

**Risk posture:** any link can break any day. Each returns `null` when it
has nothing to give (one exception: an Apify *outage* throws — see below);
the chain is InnerTube → Apify (hosted only) → Gemini watch (local
only, timeout-bound on Netlify) → friendly error. Breakage changes cost,
not correctness. **Detection signal:** if new transcripts' `source` flips
from "captions" to "video" across the board, both caption doors have
closed. Videos with NO captions at all (rare — ~1 in 10 of the owner's
channels) remain local-only for AI features on the hosted tier, since
Gemini's watch exceeds Netlify's ~26s function timeout.

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
  HISTORY; a **fuzzy title search** box (debounced ~300ms, scoped to the
  active filters via the `/api/videos` `search` param). Playing opens an
  embedded `youtube-nocookie` player and auto-marks watched; MARK SEEN
  toggles manually. No view counts anywhere — deliberate anti-distraction
  choice.
- **Channel filter**: a persistent left **rail** on wide screens (≥`lg`) —
  the active genre's channels as a vertical, searchable list (avatar +
  title + count badge), multi-select. Below `lg` the rail collapses and the
  same channels fall back to a **wrapped chip row** above the grid (the
  original layout). Both are genre-scoped — the rail's list *and* its search
  cover only the active genre — and switching genre clears the channel
  selection (outer filter resets inner refinement — prevents silently empty
  feeds).
  **Badges = total items stored for the active tab's kind**
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
- **Manage page**: add channel (URL/@handle/name + confirmation flow + a
  **"how far back" backfill-window picker, 1–5 years, default 1**), genre
  editor (color, ✎ suggested-question editor, delete), per-channel genre
  assignment, ACTIVE/PAUSED toggle, DELETE (cascades to videos).
- **Backfill 1Y–5Y** per channel or in bulk (Channels page; replaced
  RE-SYNC on 2026-10-17): "make sure every upload from the last N years is
  stored". 1Y heals holes the cron's 14-day lookback never would; 3Y+
  reaches further back on a channel added with a shorter window. Idempotent.
  **Ingestion is page-by-page** (`lib/ingest.ts → backfillChannel`): each
  page of 50 uploads is stored before the next is read, and with a deadline
  (`BACKFILL_BUDGET_MS` = 6 s, under Netlify's 10 s) it returns YouTube's
  page token as a `cursor`; the client calls `/api/channels/:id/backfill`
  again with it until done. Add-channel uses the same budget + cursor. The
  cron calls `ingestChannel` (no budget, ≤20 pages) — same results as
  before, just saved per page.
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
| `GEMINI_WATCH_MAX_MINUTES` | no | Watch-once cap for caption-less videos; 0 disables watch. Defaults: 90 locally, 0 on Netlify (function timeout kills a watch mid-flight, wasting tokens) |
| `GEMINI_DAILY_LIMIT` | no | App-level cap on total Gemini calls/day across all models (default 100) |
| `APIFY_TOKEN` | hosted only | Enables the Apify transcript fallback (datacenter IPs can't use InnerTube) |
| `APIFY_TRANSCRIPT_ACTOR` | no | Override the transcript Actor (default `starvibe~youtube-video-transcript`) |
| `BACKFILL_MONTHS` | no | Default backfill depth (months) when no window is passed (default 12 = 1 year). The add picker and Backfill 1Y–5Y always pass one, clamped to 1–60 months (max 5 years) |
| `PGLITE_DIR` | no | Local embedded DB location (default `.data/pglite`) |

## 11. Deploy checklist (Netlify — done; live at personal-tubebox.netlify.app)

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

**Done — UI/UX redesign (2026-10-16 → 17), Phases 1–10:** one top bar,
feed sidebar + study panel, Channels (replaces Manage), Notebook, Tracks,
Shorts, global search, the "calm base, retro accents" look (Phase 9) and a
code cleanup (Phase 10). Current design: [REDESIGN.md](REDESIGN.md); every
change written up: [redesign-history.md](redesign-history.md). How the UI is
built: §3.1 above.

**Built 2026-10-16:**
- **Next.js 16.2.10 → 16.3.8 (security)** — `npm audit` listed 19
  advisories; 17 were in Next.js itself (incl. critical RCE via the Image
  Optimization API / next/og, cache poisoning, SSRF), all affecting only
  versions < 16.3.8. Upgraded `next` + `eslint-config-next` (kept matched,
  pinned exactly) to 16.3.8 — chosen over the day-old 16.4.2 as the patched
  end of a 2-week-old line — which also brings patched postcss 8.5.23 and
  sharp 0.35.5; then `npm audit fix` (no `--force`) for in-range bumps.
  Result: `npm audit --omit=dev` = **0 vulnerabilities**. 9 remain, all
  dev-only (ESLint plugin chain, drizzle-kit's bundled esbuild); npm's only
  "fixes" for them are downgrades, so they're accepted. Verified: tsc, eslint,
  `npm run build` (25 routes), tracks API suite 20/20, every page with zero
  console errors. Exposure was already limited (no middleware, no next/image
  or next/og, auth checked per route), but the upgrade closes it entirely.
- **Markdown rendering for Gemini text** — `components/Markdown.tsx` wraps
  `react-markdown` 10.1.0 (pinned) with site-styled headings, bold, bullet
  and numbered lists, code, links (new tab). Used for the card's SUMMARY
  panel, Ask answers on cards, and Notebook answers; transcripts and
  personal notes stay plain text. COPY still copies the raw markdown.
  Security: react-markdown builds React elements and never renders raw HTML
  (no `rehype-raw`), and it neutralises `javascript:` URLs — verified with a
  `<script>`/`onerror`/`javascript:` payload rendering as inert text. The
  "no dangerouslySetInnerHTML anywhere" rule still holds.
- **Shorts polish** — instant capitalised hover labels on the shorts icons
  (custom, not the ~1s-delayed `title`), icons outlined via
  `components/Emoji.tsx` so pale glyphs (✨ 💬 📄) stay visible, and the legend
  restyled as bordered capital chips. *(Superseded: the redesign replaced
  emoji controls with drawn icons, and `Emoji.tsx` was removed.)*
- **Shorts layout fix** — shorts cards had grown into tall towers (narrow
  ≥150px auto-fill columns × 7 full-text buttons, wrapping channel tags),
  and the last row of every page left empty slots (24 per page in 7
  columns = 3 full rows + 3). Now: shorts use fixed column counts
  2 / 3 / 4 / 6 (`grid-cols-2 sm:3 lg:4 2xl:6`) — all divisors of the
  24-per-page batch, so every page fills complete rows; cards are compact
  (`VideoCard` `compact = video.isShort`: icon-only actions ✓ 🕑 ✨ 💬 📄 📝 🎯
  with hover/aria labels, one-line truncated channel tag) — 272px tall at
  6 columns. A legend line above the shorts grid explains the icons.
  Regular video cards are unchanged.
- **Learning tracks** (`/tracks`, header button 🎯 TRACKS) — named, ordered
  collections. Tables `tracks` (name unique) and `track_videos` (PK
  `(track_id, video_id)` → adding is idempotent; both FKs cascade, so
  deleting a channel's videos also drops them from tracks). Rules in
  `lib/tracks.ts` (routes stay thin; `app/api/tracks/respond.ts` maps
  `TrackError` → HTTP): stats per track ("4 of 9 watched · 2h 10m left",
  remaining time uses honest-watched coverage), CONTINUE = first unwatched
  in order, append at max(position)+1, move = swap with the neighbour in ONE
  `UPDATE … CASE` (`::int` casts — untyped params in a CASE resolve to
  text). Adding: `🎯 TRACK` panel on every card (inline, since cards clip
  pop-ups; tick/untick, or create by name — `components/feed/TrackMenu.tsx`), and
  in the feed, with a search active, "🎯 ADD THESE N TO A TRACK" — fetches
  every matching id via `GET /api/videos?…&ids=1` (same filters as the
  feed, oldest upload first, capped at 300) and appends them. Track page:
  progress bars, UP NEXT, ▲▼ reorder, ✕ remove, rename (name pre-selected),
  delete. Playing from the track page auto-advances to the next video when
  one ends (`PlayerModal` `onEnded`); the normal feed never does. Also
  extracted `lib/videoColumns.ts` (`feedVideoColumns`) — the one definition
  of the FeedVideo select shared by feed, notebook and tracks queries.
- **Notebook** (`/notebook`, header button 📓 NOTEBOOK) — every saved Ask
  answer (`video_notes`) and personal note in one place, grouped by video,
  most recent activity first. `GET /api/notebook` returns all answers plus
  their videos (each once, incl. note-only videos) in ONE request; the page
  filters/groups/searches in the browser (personal scale → instant, no round
  trips). Filters: BOTH / AI ANSWERS / MY NOTES; genre chips with counts;
  question chips for prompts asked ≥2 times (one-offs stay searchable);
  search inside answers, questions, notes and titles. Long answers collapse
  (SHOW ALL); per-answer COPY; COPY ALL builds one plain-text document of
  exactly what's filtered (heading names the filters, one section per video
  with its link). ▶ WATCH opens the same player (progress still recorded).
  Read-only over answers: zero Gemini calls.
- **Personal notes** — `videos.personal_note` + `personal_note_at`, one note
  per video. `📝 NOTE` on every card (a "•" when one exists) opens
  `components/NoteEditor.tsx`: autosaves ~0.8s after typing stops, on blur
  and on close (`keepalive`), retries on failure; clearing the text deletes
  the note. The same editor works inline in the Notebook (✎ EDIT / + ADD MY
  NOTE). `PATCH /api/videos/[id]` validates `personalNote` (text, ≤20,000
  chars). Note: Gemini answers contain markdown (`**bold**`) shown as raw
  text, on cards and in the Notebook alike — rendering it is a candidate fix.
- **Honest watched + resume + progress bar** — opening a video no longer
  marks it seen. The player modal uses YouTube's IFrame Player API
  (`lib/youtubePlayer.ts`, loaded once, `youtube-nocookie` host) and polls
  the playhead every second; only normal forward playback counts (seeks and
  rewinds don't). Progress is a string of 10-second chunks, "1" = played
  (`videos.watch_progress`; rules in `lib/progress.ts`, shared by client and
  server): a chunk counts once half of it was really played, sittings
  OR-merge, rewatching never double-counts. Saved every 15s, on pause/end,
  and on close (`keepalive`), with `videos.resume_seconds`.
  `PATCH /api/videos/[id]` merges progress server-side and marks the video
  watched (and clears `later_at`) only when coverage CROSSES 50% on that
  save — so a video you un-mark by hand stays un-marked. The modal resumes
  at the saved second (not if <10s in or within 15s of the end) with a
  "RESUMED AT m:ss · START OVER" chip; cards show a thin progress bar. If
  the API can't load (8s timeout), it falls back to the plain embed with no
  tracking — MARK SEEN still works. The PATCH now returns only the fields
  the UI needs, never the transcript. Fixes the Watch Later caveat below.
- **Length filter + time totals** — chips ANY / < 10 MIN / 10–30 / 30+ on
  the search row (VIDEOS only; every Short is under ~3 min, so they hide on
  SHORTS), sent as `length` = short | medium | long; duration 0 ("unknown")
  only appears under ANY. `/api/videos` now also returns `totals` (count +
  summed `duration_seconds` of everything the filters match, all pages — one
  extra query run in parallel), shown as "559 videos · 215h 14m". On LATER
  that count doubles as "how many saved videos are visible", replacing the
  separate count query. The client adjusts totals optimistically on
  mark-seen / LATER toggles. The empty state picks the most specific reason
  (search, then length, then tab) via `renderEmptyState()`.
- **Watch Later** — `videos.later_at` (nullable timestamptz; null = not
  saved, a timestamp = saved then, also the sort key) plus a partial index
  on the saved rows only. `+ LATER` / `✓ LATER` on every card; a **LATER**
  tab beside INBOX / EVERYTHING / HISTORY that, like them, follows the
  genre, channel, kind and search filters, sorted newest-saved first. Its
  badge is the *unfiltered* total, and a hint names what the filters hide
  ("N more saved outside these filters — SHOW ALL", "N saved in Shorts"), so
  a saved video is never invisible. Marking a video watched clears
  `later_at` (server-side in `PATCH /api/videos/[id]`), so the list empties
  as you go. Caveat until "honest watched" ships: pressing play still marks
  a video watched immediately, so an accidental open drops it from LATER.

**Built 2026-10-15:**
- **Manage-page channel search + genre filter chips** — filters the channel
  list in the browser (the page already loads every channel; no paging, no
  API call). Search matches name or @handle; chips are ALL / each genre /
  NO GENRE with counts; the two combine. The chip row is a self-contained
  block — delete it to go back to search-only.
- **Genre colors** (`lib/color.ts`, `components/channels/GenreColorPicker.tsx`): a
  14-color curated palette, a dot on swatches other genres already use, a
  custom swatch backed by the browser's color wheel, a live preview chip,
  and color editing for existing genres (the ✎ editor). `textColorFor()`
  picks ink or white text by WCAG contrast, used everywhere a genre color is
  a background (feed genre tabs, video-card channel tag, Manage chips) — so
  any custom color stays readable. The genre API now rejects anything but a
  6-digit hex color (`isHexColor`), validating at the boundary.

**Built 2026-08-28:**
- **Fuzzy title search** on the feed — debounced, scoped to the active
  filters (`search` param on `/api/videos`).
- **Channel-chip wrap** — the feed's channel filter row wraps onto multiple
  lines instead of one horizontal scroll (Option A of the "many channels"
  problem; now also the narrow-screen fallback for the rail below).
- **Channel rail (Option B)** — on wide screens (≥`lg`) the channel filter
  is a persistent, searchable left sidebar: the active genre's channels as a
  vertical multi-select list (real thumbnails, count badges). Below `lg` it
  collapses back to the wrapped chip row. Layout is two-column (header +
  ticker full-width, then rail + feed); the video grid is fluid
  (`auto-fill minmax`) and the page caps at ~1600px. Filtering logic
  unchanged — still multi-select → `channelIds` on `/api/videos`.
- **Backfill-window picker** on add-channel — a "how far back" chooser,
  1–5 years (default 1), sent as `years` and clamped server-side to 1–60
  months (`resolveBackfillMonths`); the success message reports the actual
  window and count. Also fixed the stale "6 months" copy that survived the
  earlier 6→12-month default change (message, helper text, code comment,
  README; the excalidraw diagram still says `BACKFILL_MONTHS=6` — re-export
  pending).

**Hardening batch — BUILT 2026-07-03:** `GEMINI_DAILY_LIMIT` app-level
daily cap; RE-SYNC button per channel; login rate limiting +
constant-time compare; friendlier errors (daily budget, video
unavailable/restricted, watch-length cap).

**Fixed 2026-07-06:**
- Apify language bug: `fetchViaApify` no longer hardcodes `language: "en"`
  only — it tries English first, then retries once with no language, which
  makes the Actor return the video's default caption track (per its input
  schema, blank = default language; no error-message parsing needed).
  Costs one extra ~$0.005 run, once ever per non-English video; Gemini
  reads any language and answers in English.
- Honest hosted error: watch-once is now **disabled when `NETLIFY` is set**
  (default `GEMINI_WATCH_MAX_MINUTES=0` there) — previously the hosted
  watch attempt burned tokens (58K TPM peak observed), got killed by the
  function timeout, and surfaced a misleading "Gemini couldn't access this
  video" error. Now it fails fast with an honest "no captions; transcribe
  locally once, cached forever" message before any Gemini call.

**Fixed 2026-10-18 — Apify outage = honest message, not a 502:** on
2026-10-17 from ~23:10 IST the Actor stopped answering (our 15s
`run-sync` calls timed out; the Apify console showed 503s). Gemini was
never reached and the key was fine. But the English → default-language
retry meant two 15s waits, ~30s total, so Netlify killed every Ask/Summary
on an uncached video with a bare 502/504. Now `runTranscriptActor`
separates "answered, but empty" (→ retry in any language, as before) from
"didn't answer / error status" (→ stop at once and throw *"The transcript
service isn't responding right now… try again in a few minutes"*). The
routes already return error messages to the UI. Nothing is cached on
failure, so the same video works once Apify is back. Videos with a saved
transcript never touch Apify, so they keep working during an outage. If an
outage lasts days, `APIFY_TRANSCRIPT_ACTOR` swaps the Actor with no code
change.

**Fixed 2026-10-18 — refresh fits Netlify's 30s with room to spare:**
every refresh (button and 6-hourly cron) took 23–30s in the Netlify logs
because `refreshAllChannels` checked channels one after another, each
mostly waiting on YouTube. After hours idle, the cold start (function boot
~2s + Neon waking from autosuspend up to ~3s) pushed it past 30s: 9 of 25
runs in a day were cut off (502/504 for the button, 499 for the cron's
fetch). Channels already done were kept, but the rest waited for the next
run, and "Synced X ago" didn't update. Now 5 channels run at once
(`REFRESH_CONCURRENCY`, a small worker pool). The YouTube calls are the
same, so quota is the same. Results are still reported in channel order.
Neon's HTTP driver makes every query its own request, so parallel queries
are safe; PGlite queues them. Measured with fake 300ms YouTube replies over
40 channels: 24.1s → 4.9s, with identical results.

**Known bugs / immediate next (2026-07-06):**
- Hosted 📄TEXT/💬ASK still unverified on an English-captioned video.
- Apify retry-with-default-language path unverified on a Hindi-captioned
  video (Vishakha Sadhwani's) — needs a hosted test after deploy.

**Ideas parked:**
- **"Channels ▾" dropdown** (Option C) — the other candidate for the
  channel filter; unneeded now that the rail (Option B) shipped, parked in
  case the rail ever feels too heavy.
- ~~Per-channel backfill window~~ — superseded 2026-10-17: Backfill takes
  the window each time (1Y–5Y), so nothing needs storing.
- Read-only public demo mode (visitors browse, can't mutate) — for
  "show people the project" without sharing the password.
- Auth: APP_PASSWORD is correct for single-user; if ever multi-user, use
  Auth.js (NextAuth) inside the app — portable across hosts — not
  platform-tied auth (Netlify Identity was deprecated then un-deprecated
  Feb 2026; the saga itself is the lock-in lesson).
- **Multi-user with roles — admin + guests (discussed 2026-09-04, parked).**
  Goal: let ~10 friends use the deployed site (add/remove channels, try it
  out) without ever touching the owner's channels/feed. Owner = protected
  admin; friends = guests.
  - *Why it's not just a column:* auth has no identity (one
    `sha256(APP_PASSWORD)` cookie for everyone, `lib/auth.ts`), and the
    schema assumes global uniqueness — `yt_channel_id`/`yt_video_id` unique,
    a single `watched` flag, global genres, one `gemini_usage` ledger.
    Single-user is baked into the unique constraints (the ingest idempotency
    keys), not a missing field.
  - *Recommended data model — shared pool + subscriptions (Option 2):* keep
    channels/videos global (one copy → uniqueness + "cache once" preserved);
    add a `subscriptions(user_id, channel_id)` table. A guest "deleting" a
    channel just unsubscribes them — the owner's subscription and the
    channel survive, so the owner is **protected by construction**. Bonus:
    summaries/transcripts stay cached once and are shared across users,
    easing quota. Needs per-user `watched` + per-user notes. (Rejected
    Option 1 = `user_id` on everything + per-user uniqueness: duplicates
    backfill per user, breaks the idempotency model.)
  - *Open decision — guest isolation granularity:* **(A)** one shared guest
    sandbox, two passwords (owner + guest) — simplest, friends see each
    other's tinkering; **(B)** a private space per friend — a `users` table,
    per-user login, and real password hashing (the current unsalted sha256
    is fine for one shared secret, not for storing many). Lean A for "just
    trying it out".
  - *The real exposure (bigger than channel-tampering):* the free-tier quota
    is shared — one YouTube key + one Gemini key. Guests running AI draw
    down the owner's Gemini daily budget and can lock the owner out, so the
    design needs guest guardrails (channel cap, backfill-depth cap,
    cap/disable guest AI). Also: a guest password shared among ~10 people
    will eventually leak — fine for a low-stakes demo, but a real step up
    from "one trusted person".
  - *Scope:* touches auth, the schema's uniqueness model, the ingest engine,
    every mutating route (server-side space enforcement, not just hidden
    buttons), and a one-time migration of existing channels to admin-owned.
    Real project, but Option 2 + sandbox A is the tractable, on-grain shape.
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
