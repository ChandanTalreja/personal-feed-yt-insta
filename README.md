# 📺 TUBEBOX — your YouTube feed, no algorithm

A personal, distraction-free YouTube feed. You pick the channels; TUBEBOX
shows their uploads in chronological order — no recommendations, no rabbit
holes, no autoplay-into-oblivion. Plus AI comprehension tools that help you
decide *whether* to watch before you spend the time. Self-hosted, open
source, and runs entirely on free tiers.

> Deep dive: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the full
> decision record, data model, quota math, and roadmap.

## Features

- **Your channels only** — add channels by URL, @handle, or plain name
  (with a "did you mean?" confirmation), organized into color-coded,
  user-defined genres
- **6-month backfill** — adding a channel immediately pulls its recent
  history via the official YouTube Data API (no scraping, no proxies);
  a scheduled function tops the feed up every 6 hours after that
- **Inbox workflow** — the default view shows only unwatched videos;
  playing one (embedded player) auto-marks it watched
- **Shorts, separated** — detected automatically and given their own tab
- **Channel filter** — multi-select chips per genre, with badges showing
  how many videos/Shorts of each channel are in your archive
- **✨ Summary** — 3–5 bullets + "worth watching if:", generated once and
  cached forever
- **💬 Ask** — ask anything about a video's content ("list all the
  interview questions asked", "what stocks does he recommend?"); answers
  are saved on that video permanently. Genres can define one suggested
  question that appears as a preset chip
- **📄 Transcript** — full spoken text: fetched free from YouTube captions
  when available, or transcribed by Gemini (which watches the video **once**
  at low cost and caches the text — every later question is a cheap text
  call)
- **Quota-aware AI** — a model fallback chain ranked by remaining daily
  budget, tracked in your own database; works within Gemini's free tier
- **Password protected** — one env var, single-user
- **Free everything** — Netlify + Neon Postgres + YouTube Data API +
  Gemini free tiers; well under every quota at personal scale

## Local development (zero setup)

```bash
git clone <this repo> && cd personal-feed-yt-insta
npm install
cp .env.example .env.local   # fill in YOUTUBE_API_KEY (see below)
npm run dev
```

That's it — with `DATABASE_URL` unset, an embedded Postgres (PGlite) is
created in `.data/` automatically. Open http://localhost:3000, go to
**+ ADD / MANAGE**, and add your first channel.

### Getting the keys (all free)

| Key | Where | Notes |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com) → new project → enable **YouTube Data API v3** → Credentials → Create API key | Required. Free 10,000 units/day (this app uses ~1%) |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key | Optional — enables summaries, ask, and AI transcripts |
| `DATABASE_URL` | [neon.tech](https://neon.tech) → new project → copy connection string | Only needed for deployment |

All configuration is environment variables — see
[.env.example](.env.example) for the complete annotated list (model chain,
backfill window, watch-length cap, etc.).

## Deploying to Netlify

1. Push this repo to GitHub and import it in
   [app.netlify.com](https://app.netlify.com). The Next.js runtime is
   detected automatically.
2. In **Site configuration → Environment variables**, set:
   `YOUTUBE_API_KEY`, `DATABASE_URL` (Neon), `APP_PASSWORD`,
   `CRON_SECRET` (any long random string), `GEMINI_API_KEY`, and
   optionally `GEMINI_MODEL` / `GEMINI_MODELS`.
3. Deploy. Tables create themselves on first use, and the scheduled
   function ([netlify/functions/feed-cron.mts](netlify/functions/feed-cron.mts))
   refreshes the feed every 6 hours.

## How it works

```
Netlify scheduler (every 6h)
        │
        ▼
GET /api/cron ──► YouTube Data API (official, ~1% of free quota)
        │              uploads playlists + video details
        ▼
   Postgres  ◄── upsert new videos (dedup by video id — never deleted)
        ▲
        │            ┌─ captions (free) ──────────────┐
Next.js UI ── AI ────┤                                 ├─► cached forever
                     └─ Gemini watches ONCE (low fps) ─┘
```

- **No scraping for the feed.** Video data comes from the official YouTube
  Data API within its free quota. (Transcripts opportunistically use
  YouTube's caption endpoint; if that ever stops working, Gemini
  transcription takes over automatically.)
- **Old videos never disappear** — the database accumulates; YouTube is
  just the sync source.
- **Every AI result is computed once and cached** — summaries, answers,
  and transcripts live in your database.

## License

MIT — fork it, self-host it, make it yours.
