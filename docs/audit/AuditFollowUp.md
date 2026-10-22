# TUBEBOX audit follow-up

**Date:** 19 October 2026
**Based on:** [AuditReport.md](AuditReport.md), the external performance and code-quality audit (done with ChatGPT, read-only).
**Purpose:** one place that records what we did after the audit, why, which audit finding it answers, and exactly what changed in the code. The day-by-day write-ups live in [../redesign-history.md](../redesign-history.md) (FIX-03, FIX-04, FEAT-13, FIX-05); this file ties them back to the audit.

---

## 1. Summary

| ID | What we did | Audit finding it answers | Status |
|---|---|---|---|
| FIX-03 | Search shows titles that contain your words first, look-alikes after | Noted by the audit as an existing local change (§1); related to §4 "P1 for search" | Done (built just before the audit) |
| A1 | ✓ Seen and bookmark no longer fail silently | §5 Reliability, **High** | Done (FIX-04) |
| A2 | Note autosaves go out one at a time, in order | §5 Reliability, **High** | Done (FIX-04) |
| A3 | A sync that couldn't check some channels says so (message and amber dot) | §5 Reliability, **Medium** | Done (FIX-04) |
| A4 | Database index for "one channel's videos" | §4 **P2**, Index and pagination | Done (FIX-04) |
| A5 | The Channels list runs its two database reads at the same time | §4 **P1**, Reduce initial request fan-out (one piece) | Done (FIX-04) |
| A6 | The sync endpoint takes its secret from a header only, never the URL | §5 Reliability, **Medium** | Done (FIX-04) |
| FEAT-13 | Offline: changes wait and save by themselves when the connection is back | Not in the audit. The owner's idea, built on top of A1 | Done |
| FIX-05 | 43 on-screen messages reworded: no em dashes, plain sentences | Not in the audit. The owner's request | Done |
| B2 | Cold starts skip the table setup when its version stamp matches | §4 **P1**, Remove production schema setup | Done 2026-10-21 (PERF-05 in redesign-history) |
| B5 (step 1) | Skip the YouTube captions try on Netlify (always refused there) | §4 **P1** for AI reliability | Done 2026-10-21 (PERF-06). The whole-request time limit was declined |
| B1, B3, B4 | Bigger performance items | §4 P1/P2 | **Not started** (see section 5) |

Everything was tested locally in the running app, and none of it used YouTube API quota, Gemini calls or Apify/Firecrawl credits. Typecheck and lint pass for the whole project.

---

## 2. How we decided what to do

We sorted every audit finding into three groups. The owner approved group A.

### A. Small, safe, real wins (done)

| # | Finding | Audit label | Effort |
|---|---|---|---|
| A1 | ✓ Seen / bookmark saves fail silently | §5 · High | Small |
| A2 | Note autosaves can overlap | §5 · High | Small |
| A3 | Refresh says "up to date" even when channels fail | §5 · Medium | Small |
| A4 | Missing index on `videos.channel_id` | §4 · P2 | Tiny |
| A5 | Channels list reads one after the other | §4 · P1 (one piece) | Tiny |
| A6 | Cron secret accepted in the URL | §5 · Medium | Tiny |

### B. Worth doing, but bigger (not started)

| # | Finding | Audit label |
|---|---|---|
| B1 | Send the first screen's data with the page (biggest win for the "Poor" LCP score) | §4 · P1, Deliver initial feed data before client effects |
| B2 | Move table setup from every cold start to deploy time | §4 · P1, Remove production schema setup |
| B3 | Make search use its index | §4 · P1 for search |
| B4 | Stop clearing every remembered screen after any save | §4 · P2, Improve cache lifetime and consistency |
| B5 | Skip YouTube captions on Netlify (always blocked) and give the transcript + Gemini steps one overall time limit | §4 · P1 for AI reliability |

### C. Skipped for now, with the reason

| Finding | Audit label | Why skipped |
|---|---|---|
| Two progress saves at the same instant can lose watched coverage | §5 · High | Needs two tabs playing the same video at once. Near-zero for a one-person app; we disagree with "High" here |
| Two identical Asks at once both call Gemini | §5 · Medium | Same reason |
| Breaker counter race | §5 · Medium | Same reason |
| Track creation not atomic; position races | §5 · Medium | Same reason |
| Global search: an old result can briefly replace a newer one | §5 · Medium | Rare, harmless, corrects itself |
| Stricter validation of feed filter inputs | §5 · Medium | Only matters for deliberately malformed requests |
| Player dialog keyboard / screen-reader behaviour | §5 · Medium | Accessibility polish, later |
| Load the study panel code only when opened | §4 · P2 | Small gain; the audit itself calls it less urgent |
| Thumbnail priority that adapts to screen width | §4 · P2 | Tiny gain after PERF-04 |
| Font preloads | §4 · P2, conditional | The audit says measure first |
| Slimmer feed data; Notebook and Tracks scaling | §4 · P2 | Not needed at 256 notes and 0 tracks |
| Move the server and database closer to India | §4 · Investigate before changing | Parked: Netlify's region can't be changed on the current plan |
| Shared types and constants, one request layer, tests | §6 | Cleanup, not speed. Tests would be worth adding before B1 |

---

## 3. What we changed, item by item

### FIX-03 · Search: exact matches first

**Why.** Searching "redis" showed "…Parakeet Redux" above real Redis videos. The search matches a title in two ways: it *contains* the word (`ILIKE`), or it *looks similar* (pg_trgm `word_similarity` above 0.4, which forgives typos). "redis" and "redux" share 3 of 6 three-letter pieces, a score of 0.50, so Redux matched, and results were only sorted newest first.

**Code.**
- `app/api/videos/route.ts`: new `searchOrder` list. While searching, it adds ``sql`(title ILIKE %term%) DESC` `` as the first sort key, so titles that contain the words come first, then look-alikes, each group in the view's usual order. Not searching: unchanged. This is the same rule the ⌘K search already used.

**Verified.** redis: 2 exact, then 7 near; docker: 15 then 2; kafka: 14; "kubernets" (typo): 22, all Kubernetes. Exact matches always came first.

**Open decision.** A stricter fuzzy check (`strict_word_similarity`, which compares whole words only) would drop junk such as "Japan" for "java" or "Real" for "react" while keeping typo tolerance. Measured over 25 searches: 1,290 results become 891, with no real match lost. The owner chose to wait. If adopted, do it together with B3.

---

### A1 · ✓ Seen and bookmark saves could fail silently

**Why (audit §5, High).** The toggles updated the screen at once, then sent the save with `.catch(() => {})` and never checked the reply. With no connection, a server error or an expired login, the card looked saved but wasn't, and the change quietly came back later.

**Code** (`components/feed/useFeedData.ts`).
- **New `saveVideo(id, field, value)`** returns `"saved" | "queued" | "refused"`.
  - `"saved"`: the server said OK.
  - `"queued"`: no connection, or the request never reached the server. The change is kept and waits (see FEAT-13).
  - `"refused"`: the server said no (logged out, server error). Waiting won't help.
- **New `restoreCard(video, at)`** puts a card that left the list (Watch later view) back in its original position.
- **`toggleWatched` and `toggleLater` rewritten around a `show(on)` helper.** `show(true)` applies the change (card, view totals, sidebar facets, Watch later counts); `show(false)` undoes exactly the same things. On `"refused"` the toggle calls `show(false)` and shows the toast **"Couldn't save. Please try again."** (`NOT_SAVED`).

**Verified** with forced failures: Seen (count 1,010 → 1,009 → back to 1,010), bookmark (Watch later 1 → 2 → 1), removing from Watch later (the card left and came back in place), each with the toast. A real save round trip changed the server and was then undone.

---

### A2 · Overlapping note autosaves

**Why (audit §5, High).** A note saves on a typing pause, when you click away, and when the panel closes. These could overlap, so an older save could land last and overwrite newer text. We also found a second bug: typing and then deleting while a save was in flight was skipped (compared against a stale "saved" value), so the deleted text stayed on the server.

**Code** (`components/NoteEditor.tsx`).
- **`queueRef`**: a promise chain. Saves go out one at a time, in order.
- **`save(final)`** now only queues a save.
- **New `send(final)`** does the actual save. It reads the text *when its turn comes*, skips if that is already saved, and on failure retries after 5 seconds.
- **`openRef`**: after the editor closes, no retry timer is started. The closing save, queued behind any save in flight, covers it.

**Verified** with the first save slowed to 2 seconds: the second save went out only when the first finished, and the server kept the newer text. Delete-during-save: the second save sent an empty note, and the note ended deleted.

---

### A3 · Failed channels hidden behind "You're up to date"

**Why (audit §5, Medium).** The sync message looked only at how many videos were added, so with failures it still said "You're up to date", and "Synced X ago" updated anyway. Nothing was being lost (each sync looks back 14 days, so a channel that fails once catches up next time), but a channel that kept failing would have stayed invisible.

**Code.**
- `lib/ingest.ts`:
  - **New `LAST_SYNC_FAILED_KEY`** (`"last_sync_failed"`), stored in `app_meta` as a JSON list of channel titles.
  - `refreshAllChannels` collects **`failed`** (titles of channels that errored) and upserts both `last_sync_at` and `last_sync_failed` in one statement. `RefreshResult` gains `failed: string[]`.
- `lib/nav.ts`: `NavSummary` gains **`lastSyncFailed`**; **new `parseList()`** reads the stored list safely. Both keys are read with one `inArray` query.
- `components/TopBar.tsx`:
  - **New `nameList(titles, max)`** turns titles into "X, Y and 3 more".
  - `syncMessage` names failed channels: *"Couldn't check 2 channels: X, Y. They'll be retried on the next sync."*
  - The synced dot turns amber (`bg-warn`) when the last sync had failures, with the names on hover.

**Verified** with fake YouTube replies on a throwaway database: 2 broken channels were recorded; the next clean sync added their 2 missed videos and cleared the list. In the app: amber dot and message with failures; green "Synced 1d ago" normally. Live logs: 27 syncs in the period, 0 failed channels, about 8 seconds each.

---

### A4 · No index on `videos.channel_id`

**Why (audit §4, P2).** Filtering by channel and per-channel counts read every video.

**Code** (`lib/db.ts`). New index `videos_channel_published_idx ON videos (channel_id, published_at DESC)` in the schema setup (now 25 statements). It's created automatically on the next cold start after deploying.

**Verified** (local, 2,183 videos): a channel filter went from a full scan, 0.64 ms, to an index scan, 0.035 ms. At the live site's size (about 19,500 videos) that's roughly 5 ms saved per query: small, but free.

---

### A5 · Channels list read one query after the other

**Why (audit §4, P1, one piece).** `/api/channels` read the channel list, waited, then read the per-channel stats. Neither needs the other.

**Code** (`app/api/channels/route.ts`). Both queries now run together with `Promise.all`: one round trip fewer on Neon.

**Verified.** The reply from the new code is byte-identical to the old code's (8,348 bytes).

---

### A6 · Cron secret accepted in the URL

**Why (audit §5, Medium).** `/api/cron` accepted the secret as `?secret=`. Secrets in URLs can end up in logs and browser history.

**Code** (`app/api/cron/route.ts`). The secret is read from the `x-cron-secret` header only. The 6-hourly scheduled function already sends the header; the refresh button uses the login cookie.

**Verified.** No code uses `?secret=`, and all 27 live `/api/cron` calls had no query string, so nothing depends on it.

---

### FEAT-13 · Offline: changes wait and save when you're back

**Why (owner's idea, building on A1).** After A1, a ✓ Seen made while offline was undone and had to be redone. Popular apps keep the change and save it when the connection returns.

**Code.**
- **New file `lib/offline.ts`** (browser-side):
  - `OFFLINE_MESSAGE`: "You're offline. Your changes will save when you're back online."
  - `isOffline()`: true when the browser reports no connection.
  - `queueVideoSave(videoId, field, value)`: adds a change to the waiting list, keeping only the latest value per video and field (three toggles become one save).
  - `pendingCount()`: how many changes are waiting.
  - `flushPending()`: sends the list oldest first, stops at the first network failure, and drops (and counts as `refused`) any save the server rejects. Returns `{ saved, refused, left }`.
  - The list lives in `localStorage` under `tubebox:pending-saves`, so it survives a reload.
  - Events: `PENDING_CHANGED` (the list changed), `PENDING_RESTORED` (changes from an earlier visit were saved).
- **New component `components/OfflineBar.tsx`**, mounted on every page in `app/layout.tsx`:
  - Shows the offline bar (with "N waiting") when the connection drops.
  - When it's back, sends the list and shows "Back online. All changes saved." (or "Your earlier changes were saved." after a reload).
  - Retries every 15 seconds if a save failed while the browser still said "online".
- `components/feed/useFeedData.ts`: `saveVideo` queues instead of failing when offline; the feed reloads on `PENDING_RESTORED`.
- `lib/api-client.ts`: a request that never reaches the server now throws "You're offline. This needs a connection." (or "Couldn't reach the server. Please try again." when online). Ask, Summary and the rest show this, and Ask keeps your question in the box.
- `components/NoteEditor.tsx`: offline, the label says "You're offline. Your note will save when you're back online."

**Not covered (by choice).** Opening TUBEBOX with no connection at all (it isn't an offline app). Track, genre and channel edits, which are harder to queue because of ordering. Ask, Summary and Transcript, which need a live answer.

**Verified** (offline simulated in the browser). The bar appeared; ✓ Seen and a bookmark stayed with "2 waiting"; back online both saved and the server confirmed them. Three toggles made one waiting save. A reload with changes waiting saved them on page open. A refused save was undone, not queued. Ask offline showed the message and made no Gemini call. All test changes were undone.

---

### FIX-05 · Friendlier messages, no em dashes

**Why (owner's request).** No em dashes in on-screen text, and several messages read like developer notes ("Unauthorized", "videoId is required", "Sync failed").

**Code.** 43 strings across 28 files: UI text, placeholders, the tab title, toasts, API error messages, and the Gemini/YouTube errors that reach the screen. Examples:

| Before | After |
|---|---|
| Unauthorized | Your login has expired. Please log in again. |
| Video not found | That video isn't in your library anymore. |
| Sync failed | Couldn't check for new videos. Please try again. |
| Too many attempts — try again in 15 minutes. | Too many attempts. Try again in 15 minutes. |
| YouTube player API timed out | The YouTube player took too long to load. Please try again. |
| Tab title "TUBEBOX — your feed, no algorithm" | "TUBEBOX: your feed, no algorithm" |
| "—" for a channel with no uploads | "None yet" |

Kept on purpose: the instructions sent *to* Gemini (never shown) and setup errors meant for whoever deploys (`GEMINI_API_KEY is not set…`).

**Verified.** No code compares message text, so the rewording can't break logic. The only non-comment em dash left is the Gemini instruction. The new tab title shows in the browser.

---

## 4. All files touched

**New:** `lib/offline.ts`, `components/OfflineBar.tsx`, `docs/audit/AuditReport.md`, `docs/audit/AuditFollowUp.md` (this file).

**Changed (behaviour):** `components/feed/useFeedData.ts`, `components/NoteEditor.tsx`, `components/TopBar.tsx`, `lib/ingest.ts`, `lib/nav.ts`, `lib/db.ts`, `lib/api-client.ts`, `app/layout.tsx`, `app/api/channels/route.ts`, `app/api/cron/route.ts`, `app/api/videos/route.ts`.

**Changed (wording only, FIX-05):** `app/api/channels/[id]/backfill/route.ts`, `app/api/channels/[id]/route.ts`, `app/api/channels/resolve/route.ts`, `app/api/genres/[id]/route.ts`, `app/api/genres/route.ts`, `app/api/login/route.ts`, `app/api/tracks/[id]/videos/route.ts`, `app/api/videos/[id]/ask/route.ts`, `app/api/videos/[id]/route.ts`, `app/api/videos/[id]/summarize/route.ts`, `app/api/videos/[id]/transcript/route.ts`, `components/LoginForm.tsx`, `components/StyleguideClient.tsx`, `components/channels/AskSuggestionsEditor.tsx`, `components/channels/ChannelRow.tsx`, `components/channels/ChannelsClient.tsx`, `components/channels/model.ts`, `components/feed/FeedClient.tsx`, `components/feed/TrackMenu.tsx`, `components/notebook/model.ts`, `lib/auth.ts`, `lib/gemini.ts`, `lib/http.ts`, `lib/youtubePlayer.ts`.

**Docs:** `docs/REDESIGN.md` (index and changelog rows), `docs/redesign-history.md` (FIX-03, FIX-04, FEAT-13, FIX-05 write-ups).

---

## 5. What's left

1. **B1: send the first screen's data with the page.** **Built 2026-10-22 as PERF-07 (Feed and Podcasts), not yet deployed;** measure again after deploying. The biggest remaining win for the "Poor" LCP score. A real rework of each screen; its own session. Add some tests first.
   **Baseline measured 2026-10-22** (live site, the owner's Chrome in India, a fresh page load each time so no remembered data):

   | Open | Page frame arrives | Data requests start | Videos arrive | First row of thumbnails | Last request done |
   |---|---|---|---|---|---|
   | Cold (after idle), 03:43:52 UTC | 4.5 s | 4.6 s | 8.2 s | 8.5 s | 8.4 s |
   | Warm, 03:44:11 | 0.6 s | 0.6 s | 1.2 s | 1.2 s | 4.2 s |
   | Warm, 03:44:22 | 0.9 s | 0.9 s | 1.6 s | 1.6 s | 3.9 s |

   Netlify's logs for the cold open: **6 new instances** (the page, then all 5 data requests: videos, nav, channels, genres, ask-suggestions, each its own cold start, 3.3 to 3.6 s server-side). Even warm, one of the 5 requests woke a new instance (3.0 to 3.5 s), so the sidebar's channels or the top bar counts filled in late. B1's target: the cold open's second wave (4.6 → 8.2 s) folded into the page's own cold start.
2. ~~**B2: move table setup to deploy time.**~~ **Done 2026-10-21 as PERF-05**, a different way: instead of deploy time, the setup list is stamped with a fingerprint of itself in `app_meta`, and a cold start that finds a matching stamp skips the lock, the queue and the 25 statements. Same gain, no build step, local PGlite stays zero-setup. Full write-up in redesign-history.
3. **B3: make search use its index.** Faster search, same results. Optional: search already feels fast, and the stricter search it was paired with has been dropped by the owner.
4. **B4: targeted cache clearing** instead of clearing everything after any save.
5. **B5:** ~~skip YouTube captions on Netlify~~ **done 2026-10-21 (PERF-06)**. The other half, one overall time limit for transcript + Gemini, was **declined by the owner**: it only turns a rare bare 502 into a friendly message while touching the timing of every step. Revisit only if bare 502s show up in real use.

---

## 6. Checks after deploying

**Deployed 2026-10-19 (`8be36ad`).** Already confirmed on the live site: the new error wording ("Your login has expired. Please log in again."), `?secret=` refused with 401, the new tab title, the channel index created (setup now 25 statements), and 0 server errors since the deploy. Still to check:

- [x] Netlify logs: the 6-hourly sync still returns 200 (confirms A6, the header-only secret). **Checked 2026-10-21:** all 23 `/api/cron` requests in the last 24 h returned 200 (the scheduled runs at 00:01, 06:01, 12:01 and 18:01 UTC plus Refresh button presses), none 401.
- [x] The top-bar dot is green and the refresh message is normal (A3). Confirmed by the owner 2026-10-21.
- [x] Filtering by a channel works as before (the A4 index is created on the first request after deploy). Confirmed by the owner 2026-10-21.
- [x] Offline test (FEAT-13): in Chrome DevTools → Network, switch to **Offline**, tick ✓ Seen on a card, check the bar says "1 waiting", switch back to **No throttling**, and check "Back online. All changes saved." appears. Confirmed by the owner 2026-10-21.
- [x] Search "redis": real Redis videos first (FIX-03). Confirmed by the owner 2026-10-21.
- [x] **After deploying B2 (PERF-05):** Confirmed live 2026-10-21: at 17:26:59 the first cold starts ran the changed list once (30 statements, version 618cc58838cf), then every cold start logged "skipped" at 155 to 222 ms. Originally: Netlify function logs show `cold init … (skipped, version … is current)` on cold starts. The very first cold instance after the deploy shows `(25 statements, version …)` once, because it writes the stamp.
- [x] **FIX-06 (not an audit item, same deploy):** Confirmed live 2026-10-21: `GEMINI_MODEL` deleted, an Ask was answered by Gemini 3.5 Flash-Lite (AI Studio usage: 2 of 500 that day). Originally: `GEMINI_MODEL` deleted on Netlify before deploying; an Ask answers, and the note's model shows `gemini-3.5-flash-lite`.
