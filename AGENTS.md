<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI/UX: the redesign is complete (Phases 1–10)

Read **[docs/REDESIGN.md](docs/REDESIGN.md)** first, starting at "Resume
here" — where things stand, the design system to follow (§2), the decisions
log, and a one-line index of every change. The full write-ups live in
[docs/redesign-history.md](docs/redesign-history.md); new UI changes are
written there in the same format (the problem, the change, how it works, key
code, alternatives, files, verified) and added to the index. Update "Resume
here" and the changelog at the end of each session. Use docs/ARCHITECTURE.md
for how the system works underneath (§3.1: how the UI code is organised).

# Project: TUBEBOX (its own project — a personal YouTube feed)

This repo is TUBEBOX: a personal, distraction-free YouTube feed with AI
comprehension tools (summary / ask / transcript per video). Single user,
free-tier-only, open-sourceable. **Read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before making changes** — it is
the authoritative decision record (data model, Gemini engine, quota math,
known gotchas, roadmap).

Quick orientation:

- **Stack**: Next.js 16 App Router + Tailwind 4, Netlify (scheduled function
  = cron), Drizzle + Neon Postgres (PGlite embedded fallback locally, auto-
  created in `.data/`), official YouTube Data API, Gemini API.
- **Layers (one-way)**: UI components (`components/`) → route handlers
  (`app/api/**`) → domain engines (`lib/ingest.ts`, `lib/gemini.ts`,
  `lib/transcript.ts`, `lib/youtube.ts`) → providers/DB. Don't skip layers.
- **Non-negotiable principles**: Postgres owns the data (YouTube is a sync
  source); every write idempotent (unique `yt_video_id`); every AI result
  cached forever; quotas are design constraints (model chain + `gemini_usage`
  ledger); unofficial dependencies (InnerTube ANDROID-client captions in
  `lib/transcript.ts`) must degrade gracefully to official paths; config over
  code (env vars + genre rows).
- **Working style**: the owner is learning Next.js and system design through
  this project — discuss/design first, code after agreement, and explain the
  architectural reasoning of changes. Verify with the running app (PGlite
  makes local end-to-end testing free).
- Secrets live in `.env.local` (gitignored); `.env.example` documents every
  variable. Never commit keys; never print them.
