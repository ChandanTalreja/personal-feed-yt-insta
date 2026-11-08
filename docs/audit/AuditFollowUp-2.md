# TUBEBOX audit follow-up, round 2

A second external audit, run by ChatGPT on 2026-11-01 over commit `84797f9`
plus the uncommitted work (REF-17 to REF-20). The report is
[AuditReport-2.md](AuditReport-2.md) (kept out of commits, like the first).
Every finding was checked against the code before deciding; the owner chose
what to build. The first round is [AuditFollowUp.md](AuditFollowUp.md).

## 1. Built (FIX-10, 2026-11-01, not yet deployed)

Full write-up: FIX-10 in [../redesign-history.md](../redesign-history.md).

| Item | Finding (audit section) | Checked | What we did |
|---|---|---|---|
| C1 | Sticky notes can save older text over newer text; "saved" moves before the server confirms; no retry; a refused delete loses the note from the board (§2) | True | The video note's ordered save queue, a 5 s retry with a message that clears, a last save on close, a refused delete puts the note back |
| C2 | A video note written offline is lost when its panel closes (§6) | True (the offline label promised it would save) | A failed closing save goes on the offline waiting list; reopening shows the waiting text |
| C3 | Sending the offline waiting list drops changes on a temporary server error (§6) | True (a 502 counted as "refused") | A 5xx keeps the change waiting; the offline bar retries every 15 s; only a 4xx is dropped |
| C4 | A block taller than an A4 page is cut off (§4) | True in code, nearly impossible in use (answers are one or two sentences) | Such a page grows; in the PDF it runs on over the next pages |

## 2. Not built, with the reason

| Finding (audit section) | Checked | Why not |
|---|---|---|
| Changing a video doesn't forget the remembered `/api/videos/12` reply (§3) | True | No screen reads that reply, so nothing shows wrong. A one-line tidy-up next time `lib/api-client.ts` is open |
| A GET started before a change can re-remember old data (§3) | True | Every screen fetches fresh right after showing the remembered reply, so it corrects itself within a second |
| Feed patches don't recount filtered lists (§3) | Partly | Same: the fresh fetch corrects it |
| "Pick up where you left off" reads every track's videos (§5) | True | 2 tracks. Revisit if tracks grow a lot |
| The first screen waits for all its parts (§5) | True | Measure a real cold open first (still on the owner's list) |
| Lazy-load the study panel, player and sticky board (§7) | Unmeasured | The audit says so itself; skipped in round 1 too |
| Sticky note typing resizes every line (§7) | Unmeasured | No trace ties it to the slow INP point; measure first |
| Offline saves vanish when storage refuses writes (§6) | True | Private mode or a full disk only; the list still lives for the page |
| Older waiting changes can overwrite newer online ones (§6) | Narrow | For notes, a direct save now drops the waiting copy (C2). For ✓ Seen and Watch later, needs a change offline, then the opposite change online before the list is sent |
| Progress merge read/modify/write; duplicate Gemini calls; search results out of order; search index (§6) | Unchanged | Skipped in round 1 with reasons (one person, one tab); nothing has changed |
| Player doesn't retry failed progress saves (§6) | Not checked | Progress saves every 15 s anyway; a missed one is covered by the next |
| Cheat-sheet lines drop text under matching headings (§6) | Not checked | Only affects what Gemini sees when building a sheet; check if a sheet looks thin |
| RUM: LCP up to 5.9 s (§1) | Matches earlier measurements | Cold opens: one function boot plus Neon waking, the free stack's floor |
