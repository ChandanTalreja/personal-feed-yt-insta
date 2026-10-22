# TUBEBOX — Redesign history

> The record of how the redesign was built: every change written up in full
> (the problem, the change, how it works, key code, alternatives, files,
> verified), the Phases 1–8 design values that v2 replaced, and the
> feature-status table the redesign started from. For the current design and
> where things stand, see [REDESIGN.md](REDESIGN.md).

## Where the files are now

A "§" in a write-up means a section of [REDESIGN.md](REDESIGN.md) (§2 is
the design system); §2 *Icons* in UI-06 is the Phases 1–8 icon rules, now
at the end of this file.

Phase 10 (CLEAN-04) moved each screen's files into its own folder. Write-ups
from before that name files by their old place:

| Was | Now |
|---|---|
| `components/FeedClient.tsx`, `FeedSidebar`, `VideoCard`, `StudyPanel`, `TrackMenu` | `components/feed/…` (and `useFeedData.ts`, `FeedEmptyState.tsx`, `model.ts`) |
| `components/NotebookClient.tsx` | `components/notebook/` (`NotebookClient`, `NotebookReader`, `ListControls`, `model`) |
| `components/TracksClient.tsx` | `components/tracks/` (`TracksClient`, `TrackPath`, `model`) |
| `components/ChannelsClient.tsx`, `GenresPanel`, `GenreColorPicker`, `AskSuggestionsEditor` | `components/channels/…` (and `AddChannelBar`, `ChannelRow`, `TableParts`, `model`) |
| `components/Emoji.tsx` | removed (Phase 9) |
| CSS `.nb`, `.nb-input`, `.nb-chip`, `.nb-btn` | `.card`, `.field`, `.chip`, `Button` (CLEAN-01) |

---

## Change catalogue


Each change has an ID: **UX** (hard to use), **UI** (visual problems), **REF**
(refinements and polish), **FEAT** (new features).

### How items are written

An item starts as **planned** — *The problem* and *The change*. When it's
built, it gains *How it works*, *Key code*, *Alternatives considered*,
*Files* and *Verified*. Explanations are in plain English first; code is a
short excerpt of the key lines with comments, plus where to find the rest.

<details>
<summary>Example of a finished item (from an earlier change)</summary>

#### PERF-02 · Faster app start, without the two-at-once crash  — ✅ done · 2026-09-05

**The problem**
Every time Netlify starts a fresh copy of the app (a "cold start" — this
happens after a few idle minutes), the app first makes sure all its database
tables exist. It did this by sending about 15 separate instructions to the
database, one after another, waiting for each answer before sending the next.
The database is in the US and every trip there and back takes about a quarter
of a second, so the app spent roughly 3 seconds on this checklist before it
could show anything.

**The change**
The app now packs the whole checklist into one message and sends it once:
one trip instead of fifteen, so ~3 seconds became a fraction of a second.

That created a rarer problem. Netlify sometimes starts two fresh copies at
the same moment, and both ran the checklist at once. Because each checklist
now runs as one unbroken unit, both copies could end up holding something the
other needed and wait for each other forever — a "deadlock". The database
kills one of them and the page shows an error. This happened in production.

**How it works**
Think of a single-occupancy room with a "take a number" machine at the door.
Before a copy of the app touches any table, it takes the number for the room
"schema setup". The first copy goes in and runs its checklist. A second copy
arriving at the same moment waits at the door — *before* it has grabbed
anything, so it can't be holding something the first copy needs. When the
first copy finishes, the room frees up by itself, the second goes in, finds
every table already there, and finishes almost instantly.

Two details make this safe: every checklist step says "create this *if it
doesn't already exist*", so running it twice changes nothing; and the room
frees itself when the checklist ends, even if something fails midway.

**Key code** — `lib/db.ts` → `schemaSetupBlock()`
```ts
"DO $$ BEGIN",                              // start one combined message
`PERFORM pg_advisory_xact_lock(7201314);`,  // take the number for the room
`${DDL.join(";\n")};`,                      // the whole checklist
"END $$",                                   // finish — the room frees itself
```
`pg_advisory_xact_lock` is Postgres's built-in "take a number" lock. 7201314
is just the room's name; every copy of the app uses the same one.

**Alternatives considered**
- Back to 15 separate trips — fixes the crash, brings the slow start back.
- Catch the crash and retry — usually works, but hides the cause and adds a
  delay every time it happens.

**Files** — `lib/db.ts`

**Verified** — Netlify logs show one "cold init … 1 round trip" line per app
copy; the deadlock error hasn't appeared since.

</details>

---

### UX — things that were hard to use

#### UX-01 · Cards: two quick toggles and a tool strip — ✅ done · 2026-10-16
**The problem**
Every card carried seven full buttons (Mark seen, Later, Summary, Ask, Text,
Note, Track). On narrow shorts they needed an icon legend. Clicking one opened
a panel *inside* the card, so a chat box or a transcript got squeezed into a
few hundred pixels.

**The change**
Triage sits on the thumbnail: **✓ seen** top-left, **bookmark (later)**
top-right, filled when on. Below the title and channel, one tool strip:
**Ask** first with the number of saved answers, then icons for Summary,
Transcript, Note (a red dot when a note exists) and Add to track, each with an
instant hover label. The tool that's open is filled black and the card gets a
yellow shadow, so you can see which card the panel belongs to. No tool opens
anything inside the card any more; they all open the study panel (UX-02).
The emoji are replaced by simple line icons from the design.

**How it works**
The card stopped *doing* things and now only *reports* them. Before, each
card held its own summary, transcript and answers, plus the code to fetch
them. Now it holds nothing: clicking a tool tells the feed "open the panel on
this video, at this tab", and the panel does the work. A light switch
doesn't contain the lamp; it just tells the lamp what to do.

The answer count comes with the feed itself: each video in the page's
response now carries `answerCount`, counted in the same database query. A new
index on saved answers by video keeps that count instant.

The corner toggles sit *over* the thumbnail but aren't *inside* its play
button, because a button inside a button isn't allowed in HTML (the browser
would split them apart).

On narrow cards (shorts in six columns) the word "Ask" hides and only its
icon shows. That's decided by the card's own width, not the window's
(a *container query*), so the same card works in a wide grid, a narrow grid,
or beside the open panel.

**Key code** — `components/VideoCard.tsx`
```tsx
// The card only reports which tool was clicked; the panel does the work.
<StripButton active={activeTool === "ask"} onClick={() => onOpenTool(video, "ask")}>
  <Icon name="ask" />
  <span className="hidden @min-[12rem]:inline">Ask</span>  {/* hides on narrow cards */}
  {video.answerCount > 0 && <span>{video.answerCount}</span>}
</StripButton>
```
`lib/videoColumns.ts` adds `answerCount` to every video sent to the screen;
`components/ui/Icon.tsx` holds the line icons.

**Alternatives considered**
- *Keep the in-card popups and only restyle them*: the root problem is space;
  a 280px card can't hold a conversation.
- *A dropdown "Study ▾" menu on each card* (design round 1): one more click
  for the thing you do most (Ask).

**Files** — `components/VideoCard.tsx` (rewritten), `components/ui/Icon.tsx`
(new), `lib/videoColumns.ts`, `components/types.ts`, `lib/db.ts` (index)

**Verified** — cards show the corner toggles, the strip with hover labels, the
answer badge (1 on "Top 50 Kafka") and the note dot; the active tool fills
black and the card gets the yellow shadow.

#### UX-02 · Study panel on the right — ✅ done · 2026-10-16
**The problem**
AI features lived in tiny in-card popups; long answers and transcripts were
hard to read, and there was no single place to study a video.

**The change**
A panel on the right with the video's thumbnail, title, channel and length, a
yellow **▶ Watch** (or **Resume**) button for the in-app player, **Add to
track**, then four tabs: **Ask · Summary · Transcript · Note**.
- **Ask** is a conversation: your question on the right in black, Gemini's
  answer below with its age and a Copy link. Suggestions (FEAT-09) and the
  question box stay pinned at the bottom.
- **Summary** renders the saved summary with Copy.
- **Transcript** shows times in their own column, with a **Find** box that
  narrows the text to the passages mentioning a word and highlights it.
- **Note** is your note, with more room than before, saved automatically.

While the panel is open the grid narrows (four columns to three at 1440px)
instead of being covered. Esc closes it. On a phone the panel fills the
screen.

**How it works**
*One panel, many cards.* The feed remembers one thing: which video the panel
is showing, which tab, and whether the track chooser is open. Clicking a tool
on any card changes that; clicking the same tool again closes the panel.
Each time the video changes, the panel starts fresh (React's `key`, a name
tag: a new name means a new panel, not a reused one with old answers in it).

*Nothing costs anything by surprise.* A tab only loads when you pick it,
and only once. The summary, transcript and answers are all cached on the
server, so a second look is free. Opening the panel on Ask only reads saved
answers; Gemini is asked only when you send a question or press a
suggestion.

*Staying in agreement.* When the panel learns something new (a summary
arrives, an answer is added, the note changes) it tells the feed, which
updates the card: the answer badge goes up, the note dot appears. If the
video leaves the list (say you're on Later and it gets watched), the panel
keeps its own copy, so it doesn't vanish mid-read.

*Why the grid narrows instead of being covered.* The panel is a column
beside the grid, not a layer on top. The grid's column count follows the
width it actually has (a container query again), so it reflows from four
columns to three by itself.

**Key code** — `components/FeedClient.tsx`
```tsx
// The panel's whole state: which video, which tab, track chooser open?
const [study, setStudy] = useState<{ video: FeedVideo; tab: StudyTab; track: boolean } | null>(null);

// A new video means a new panel (fresh state), thanks to the key.
<StudyPanel key={studyVideo.id} video={studyVideo} tab={study.tab} … />
```
`components/StudyPanel.tsx` holds the tabs; `components/ui/SidePanel.tsx`
gained a pinned `footer` for the Ask box.

**Alternatives considered**
- *A pop-up window (modal) over the feed*: covers the grid, so you can't
  glance between videos while reading.
- *Expand the card in place*: the grid jumps around, and it's still narrow.
- *Load every tab as soon as the panel opens*: faster switching, but a
  summary or transcript can cost a Gemini call (or Apify on the live site)
  for something you may never read.

**Files** — `components/StudyPanel.tsx` (new), `components/FeedClient.tsx`,
`components/ui/SidePanel.tsx`, `components/NoteEditor.tsx` (larger style),
`components/CopyButton.tsx` (quiet style)

**Verified** — on "Top 50 Kafka Interview Questions" (1 saved answer, saved
summary): the conversation loaded, Summary rendered without calling Gemini,
Transcript loaded from the saved copy and "zookeeper" found 5 passages, Note
opened focused, Add to track listed tracks. The grid went from 4 to 3 columns;
Esc closed the panel.

#### UX-03 · One top bar — ✅ done · 2026-10-16
**The problem**
The header had four big buttons of equal weight (Refresh, Notebook, Tracks,
Add/Manage) plus a scrolling ticker, so navigation and actions competed. Each
of the other pages had its own header with a "← BACK TO FEED" button, which
meant every trip between Notebook and Tracks went through the feed.

**The change**
One strip across the top of every page, which stays in place while the page
scrolls: TV logo · **Feed · Notebook · Tracks · Channels** (with counts, the
current one filled black) · "Synced 4 min ago" with a small refresh icon ·
**+ Add channel** as the single yellow button. "Back to feed" buttons are
gone, since the bar goes anywhere from anywhere. The search box arrives with
global search in Phase 8; it isn't shown before it works.

**How it works**
The bar is one component, `TopBar`, that every page places at its top, so it
can't drift apart from page to page. It works out which tab to fill black
from the page's address (`/notebook` → Notebook). Channels points to the
existing Manage page until Phase 4 replaces it.

*"Synced 4 min ago."* TUBEBOX didn't record when it last checked YouTube. The
newest video's fetch time looks similar, but it's wrong: a sync that finds
nothing new leaves it unchanged, so the bar would say "3 days ago" right
after a sync. So the sync now writes its finish time into a new, tiny
**`app_meta`** table: a key/value notebook for app-wide facts (one row today:
`last_sync_at`). Both the refresh icon and Netlify's scheduled sync (every
6 hours) go through the same function, so either one updates it. The label re-reads the
clock every 30 seconds, so "just now" turns into "1 min ago" without asking
the server.

*Refresh.* The icon runs the same sync as the old REFRESH button and shows
the same result ("80 new videos — KodeKloud (17), …") in a yellow note under
the bar. Afterwards the bar recounts, and if the page has something to
reload (the feed does: new videos, channel counts), it's told to.

**Key code** — `components/TopBar.tsx`
```tsx
// Which tab is filled black: "/" must match exactly, the rest by prefix.
const isActive = (href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

// After a sync: recount the bar, and let the page reload its own data.
await Promise.all([loadNav(), onRefreshed?.()]);
```
`lib/ingest.ts` → `refreshAllChannels()` records the time at the end; the new
table is in `lib/schema.ts` (`appMeta`) and `lib/db.ts`.

**Alternatives considered**
- *Put the bar in the shared layout (`app/layout.tsx`)*: Next.js keeps a
  layout on screen across page changes, so the bar wouldn't reload its counts
  on every move. But the login page shares that layout and must not show the
  bar, and a layout can't hand the feed its "reload after sync" callback. The
  idiomatic fix is a *route group* (`app/(app)/layout.tsx` wrapping every
  page except login). That's worth doing later; it's a file move with no
  visible change.
- *Use the newest video's fetch time for "Synced"*: no new table, but it
  gives the wrong answer whenever a sync finds nothing (see above).
- *Show the search box now and wire it up in Phase 8*: rejected. A box that
  does nothing is worse than no box.

**Files** — `components/TopBar.tsx` (new), `lib/schema.ts`, `lib/db.ts`,
`lib/ingest.ts`; every page client (`FeedClient`, `NotebookClient`,
`TracksClient`, `ManageClient`, `StyleguideClient`) swaps its header for the
bar.

**Verified** — at 1440px the bar is 58px tall and stays put while scrolling,
and the current tab is filled black on Feed, Notebook, Tracks and Channels
(none on the style guide). It read "Not synced yet" on a fresh database;
after the refresh icon it read "Synced just now", the Feed count went from
1275 to 1355, and the note listed the 80 new videos. No console errors on any
page; production build passes.

#### UX-04 · Feed sidebar: views, genres and channels in one place — ✅ done · 2026-10-16
**The problem**
Filters were spread across the page: genre chips, a type row, a watched-state
row, search and length, and the channel rail — five places to look.

**The change**
A left sidebar with three sections, each row with a count:
- **Views**: Inbox, Later, History, Everything. Places, not filters.
- **Genres**: All genres plus each genre with its colour square.
- **Channels**: a filter box ("1 of 13 · Esc clears"), the first 8 channels
  with "Show all", picked channels kept at the top, and "Clear" when any are
  picked.

The sidebar has its own scroll, so a long channel list never pushes the feed
down. On narrow screens it hides behind a **Filters** button.

**How it works**
The sidebar is only a remote control. It shows the choices and reports
clicks; the feed keeps the choices and loads the videos, exactly as with the
old chips. The rules didn't change either: picking a genre clears the channel
choice (so the feed never silently empties), and channels are listed only
for the current genre.

**Key code** — `components/FeedSidebar.tsx`
```tsx
<SidebarItem label="Inbox" active={view === "unwatched"} count={facets.views.unwatched} onClick={() => onView("unwatched")} />
```
Built from the Phase 1 `SidebarSection` / `SidebarItem` pieces.

**Alternatives considered**
- *Keep chips across the top*: they wrap into several rows with 98 channels,
  and they scroll away with the feed.
- *Show all channels always*: a 98-row list buries Genres and Views under it.

**Files** — `components/FeedSidebar.tsx` (new), `components/FeedClient.tsx`

**Verified** — views, genres and channel picks filter the feed; "code dec"
narrows to Code Decode ("1 of 13"); Clear works; on a 375px screen the
sidebar opens from Filters.

#### UX-05 · Type and length as segmented controls — ✅ done · 2026-10-16
**The problem**
Videos/Shorts and the length chips sat in separate rows, away from what they
affect, and nothing said plainly what you were looking at.

**The change**
A title row: the view's name large ("Inbox"), and under it one line in Space
Mono saying what's on screen, e.g. "2 unseen from Code Decode matching "Top
50 Kafka" · 1h 32m · newest first". Beside it: the title search, **Videos |
Shorts**, and **Any length | < 10m | 10–30m | 30m +** (videos only).

**How it works**
The line under the title is put together from the same choices that load the
feed (view, genre or channels, search) plus the totals the server already
sends, so it can never disagree with the grid. The two controls are the
Phase 1 `SegmentedControl`. The title search stays here until global search
(Phase 8) gives the top bar a search box.

**Key code** — `components/FeedClient.tsx` → `subtitle()`
```ts
// "124 unseen in DSA · 38h 12m · newest first"
return `${count} ${noun}${scope}${matching} · ${formatTotalTime(seconds)} · ${order}`;
```

**Alternatives considered**
- *Keep chips for type and length*: chips read as "tags you can combine",
  but these are either/or choices; a segmented control shows exactly one is
  on.
- *Put type and length in the sidebar*: they change the shape of the grid,
  so they belong next to it, where you're looking.

**Files** — `components/FeedClient.tsx`

**Verified** — the line updates with view, genre, channel and search; Shorts
hides the length control.

#### UX-06 · Shorts use the same card grammar — ✅ done · card 2026-10-16 · title row 2026-10-17
**The problem**
Shorts got their own icon row and a legend explaining the icons, and the
Shorts tab looked like the videos page with a different switch flipped: no
sense of "this is the Shorts place", and no way to just watch them.

**The change**
- *The card (Phase 3, with UX-01):* shorts use the same card as videos:
  corner toggles, the tool strip ("Ask" shrinks to its icon on narrow cards),
  instant hover labels, so the legend row is gone. Cards stay landscape,
  because real short thumbnails are landscape.
- *The title row (Phase 7):* on Shorts the big title reads **Shorts**, with
  the same line under it ("921 unseen · 24h 25m · newest first"), the
  **Videos | Shorts** switch, and a yellow **▶ Play unseen in a row**
  (FEAT-04). The length switch stays hidden, since every short is under ~3
  minutes.

**How it works**
Shorts and videos are one page with one card component; the switch only
changes the "kind" the feed asks the server for. So the title row reads the
same switch: when it's Shorts, the title says so and the play button
appears. It only shows when there's something unseen to play. On History,
where everything is seen, it hides.

**Key code** — `components/FeedClient.tsx`
```tsx
<h1>{kind === "shorts" ? "Shorts" : VIEW_TITLES[view]}</h1>
{kind === "shorts" && videos.some((v) => !v.watched) && (
  <Button variant="primary" onClick={playUnseen}>▶ Play unseen in a row</Button>
)}
```

**Alternatives considered**
- *Portrait (9:16) cards for shorts*: decided against early (decisions log).
  Real short thumbnails are landscape, so portrait would crop them.
- *A separate /shorts page*: duplicates the sidebar, filters and counts for
  no gain; it's the same feed with a different kind.
- *Keep "Inbox" as the title on Shorts*: the design's "Shorts" says where
  you are; the view (Inbox, Later…) is still marked in the sidebar and in
  the line under the title ("unseen", "saved").

**Files** — `components/FeedClient.tsx`, `components/VideoCard.tsx` (Phase 3)

**Verified** — switching to Shorts showed the title "Shorts", "921 unseen ·
24h 25m · newest first" and the play button; six columns of the shared card.

#### UX-07 · Notebook as list and reader — ✅ done · 2026-10-17
**The problem**
The Notebook was one long scroll of blocks: a long answer pushed every other
video down the page, long answers had to be expanded one by one, and the
filters took three rows of chips.

**The change**
Two panes, like an email app:
- **List (left)**: the title, a search box, two dropdowns (**genre** with
  counts, **question**, i.e. questions you've asked at least twice), and an
  **All | Answers | My notes** switch, then every video with a small
  thumbnail, title, channel, answer count, "note" if it has one, and when
  it was last touched. The open video is marked in yellow. A ⋯ menu holds
  **Copy all N shown, as Markdown**.
- **Reader (right)**: the video's title, channel, length and age, **Copy as
  Markdown** and **Watch/Resume**, then every answer in the order you asked
  it, at a comfortable reading width, never cut short. Then the follow-up
  box (FEAT-05), then your note: shown with Edit, or a dashed "Add your own
  note" invitation.
- On a phone you get the list first; tapping a video opens the reader at its
  top, with "‹ All videos" to go back.

**How it works**
*Filters pick videos; the reader shows the whole video.* Search, question
and type decide which videos are listed. The reader always shows everything
for the chosen one, because when you're reading it's confusing for answers
to vanish. Answers that match the active question or search get a thick
yellow edge, so you can still see why the video is listed.

*Genre counts follow the other filters.* As in the feed sidebar, each
genre's number is what you'd get by picking it with everything else kept.

*The open video lives in the address* (`/notebook?v=1542`). Reloading keeps
your place, and global search (Phase 8) can link straight to an answer.
This uses `history.replaceState`, which changes the address without a page
load and without filling Back with every click.

*Still one request.* The page loads every answer and its videos once and
does all filtering in the browser, as before, so every click is instant.

**Key code** — `components/NotebookClient.tsx`
```ts
// Filters choose videos; the reader then shows the chosen one in full.
const visible = genreFilter === "all" ? beforeGenre : beforeGenre.filter(byGenre);
const selected = visible.find((e) => e.video.id === selectedId) ?? visible[0] ?? null;
```

**Alternatives considered**
- *Keep one scroll and collapse long answers* (the old page): still pushes
  everything around, and every long answer needs a click.
- *Show only the matching answers in the reader*: answers jumping in and
  out as you filter loses your place; marking them keeps the context.
- *Merge similar questions into one chip*: dropped earlier (decisions log).
  The question dropdown lists exact repeats, and search catches the rest.

**Files** — `components/NotebookClient.tsx` (rewritten)

**Verified** — 24 videos / 28 answers listed; choosing one updated the
address (`?v=1542`) and the reader; the question filter "List all the
questions asked in this video · 18" narrowed to 18 videos and marked the
matching answer; "My notes" (none yet) showed "No matches" instead of a
stale video; the note invitation opened the editor with the cursor in it;
the ⋯ menu offered "Copy all 24 shown"; on a phone the list → reader →
back flow worked with no sideways scroll; no console errors in a fresh tab.

#### UX-08 · Tracks as list and path — ✅ done · 2026-10-17
**The problem**
The list of tracks and a track's details took turns in one column: open a
track and the list disappeared behind "← ALL TRACKS". Progress was a plain
bar, "what's next" was a small UP NEXT tag inside the list, and every row
carried four buttons (▶ ▲ ▼ ✕) all the time.

**The change**
Two panes, like the Notebook:
- **Tracks (left)**: each with its genre colour, name, "3/12", a progress
  bar and "2h 10m left · last watched yesterday" (FEAT-06). The track you
  watched most recently is on top. **+ New track** opens a name box right
  there, and the new track opens straight away.
- **The chosen track (right)**: "TRACK · INTERVIEW" (the genre most of its
  videos are in), the name, "3 of 12 done · 2h 10m left", and drawn Rename
  and Delete buttons. Under it:
  - a **block bar**, one block per video: black = done, yellow = the next
    one, empty = still to do. Hover a block for its title. Very long tracks
    (over 60) get a plain bar, since blocks would be slivers.
  - an **Up next** card: thumbnail with how much is played, "UP NEXT · STEP
    4", title, channel, length, "resumes at 12:30", and **Continue** (or
    Resume). A finished track says so instead.
  - **the path**: every video in order with a numbered box (✓ when done,
    yellow for the next), title (click to play), channel, saved answers,
    length or "40%" if half-way, and ▲ ▼ ✕ that appear on hover (always
    shown on touch screens).
- **Delete** asks in-page: "Its 12 videos stay in your feed; only the track
  goes." **Rename** opens with the old name selected, so typing replaces it.
- The open track is in the address (`/tracks?t=34`); on a phone the list
  comes first, with "‹ All tracks" to go back.
- Autoplay is kept: when a video started here ends, the next one plays.

**How it works**
*The block bar is the track itself.* Each block is one video, coloured by
the same `watched` flag the rest of the app uses, so it can't disagree with
the list. "Next" is simply the first video in order that isn't watched; that
is also what Continue opens and what the yellow block and row mark.

*The genre label is worked out, not stored.* Tracks don't have a genre, but
their videos do. The server counts the genres of a track's videos and
picks the most common one.

*Order of the list.* Tracks sort by when you last watched any of their
videos (FEAT-06), then by when they were made. The tracks you're actually
working on stay at the top without you arranging anything.

**Key code** — `components/TracksClient.tsx` → `TrackPath`
```tsx
// One block per video: done, the next one, or still to do.
const nextIndex = videos.findIndex((v) => !v.watched);
{videos.map((v, i) => (
  <span className={v.watched ? "bg-ink" : i === nextIndex ? "bg-primary" : "bg-surface"} />
))}
```
`lib/tracks.ts` → `mostCommon()` picks the label's genre.

**Alternatives considered**
- *Drag-and-drop reordering*: decided earlier to keep ▲▼ (decisions log);
  they're now quieter, shown on hover.
- *Store a genre on each track*: one more thing to set and keep in step;
  the videos already say what the track is about.
- *Show only a window of steps around the next one* (the design's mock):
  hides where you are in a long track. The full list scrolls, and the next
  step is highlighted.

**Files** — `components/TracksClient.tsx` (rewritten), `lib/tracks.ts`
(`lastPlayedAt`, `genreId`, `mostCommon`)

**Verified** — on a temporary test track (deleted afterwards): New track
created and opened it (`?t=100`); three added videos showed three blocks;
▼ moved step 1 down, ✕ removed the last; Rename opened with the name
selected and saved; Delete showed the in-page confirm and removed it,
falling back to the "AI" track. On a phone, list → track → back worked with
no sideways scroll. No console errors in a fresh tab; build passes.

#### UX-09 · Channels page replaces Manage — ✅ done · 2026-10-17
**The problem**
Manage was a long list of large rows, each with a red Delete button; genre
editing was mixed in; it was hard to spot dead channels, and every change
was one channel at a time.

**The change**
A new page at **/channels** (the old /manage address forwards there):
- **Add bar** on top: URL, @handle or name · genre · **Backfill 1Y–5Y** ·
  yellow **Add**. Plain names still show "Found X. Is this the one?" first.
  The top bar's "+ Add channel" lands here with the cursor already in the box.
- **A dense table**: tick box · channel (photo, name, @handle) · genre (a
  chip you can change in one click) · videos (+ shorts) · last upload ·
  status · ⋯ menu. Click a row anywhere to tick it. Sort by name, videos or
  last upload. A find box and **All / Quiet / Paused** filters sit on top; the
  title line says how many are paused and links "1 quiet for 3+ months".
- **Bulk bar** (FEAT-08) replaces the toolbar once anything is ticked.
- **⋯ menu per row**: Backfill 1Y–5Y (was Re-sync; see FEAT-10), Pause/Resume, Delete…. Delete goes through the
  same confirm step as the bulk bar.
- **Genres panel** on the right: every genre with its channel count; click
  one to narrow the table, the pencil edits in place (name, colour,
  suggested question, delete with a confirm). **+ New** adds one.
- **Everyday Ask suggestions** (FEAT-09) moved here, under the genres.
- On a phone each row collapses to the name plus one summary line ("Tech ·
  76 videos · 16h ago · Active").

**How it works**
*Everything is on screen at once.* With ~100 channels, the page loads them
all in one request and does the finding, filtering and sorting in the
browser, so typing in the find box or clicking a genre is instant and costs
nothing. Paging would only add round trips.

*Changes are reports, not separate screens.* The row's genre chip, the ⋯
menu and the bulk bar all call the same few functions (move, pause, delete,
re-sync) with a list of channel ids, whether that list has one channel or
twenty. One code path, so a single-row change and a bulk change can't behave
differently.

*Delete is deliberate.* It's never one click: the black bar turns into a
sentence saying exactly what goes ("Delete 2 channels and their 115 videos?
Saved answers and notes on those videos go too."), with the button repeating
the count. That's the confirm the browser's own pop-up couldn't word as
clearly.

**Key code** — `components/ChannelsClient.tsx`
```ts
// Every change (one row or twenty) goes through the same call.
async function bulk(ids: number[], action: "move" | "pause" | "resume" | "delete", genreId?: number | null) {
  const res = await fetch("/api/channels/bulk", { method: "POST", body: JSON.stringify({ ids, action, genreId }) });
  …
}
```
`app/channels/page.tsx` is the route; `next.config.ts` forwards `/manage`;
`components/GenresPanel.tsx` is the right-hand panel.

**Alternatives considered**
- *Keep the Manage page and restyle it*: the problems were the shape (big
  rows, one-at-a-time actions, no "when did it last upload"), not the look.
- *Load the table a page at a time from the server*: right for thousands of
  rows; for ~100 it adds a wait to every click.
- *Keep `/manage` as the address*: the nav says "Channels", so the address
  should too; the forward keeps old bookmarks working.

**Files** — `components/ChannelsClient.tsx`, `components/GenresPanel.tsx`,
`app/channels/page.tsx` (all new); `next.config.ts` (forward);
`components/TopBar.tsx`, `FeedClient.tsx`, `StudyPanel.tsx`
(links), `AskSuggestionsEditor.tsx` (panel style),
`components/ui/Icon.tsx` (more, pause, trash, chevUp). Removed:
`components/ManageClient.tsx`, `app/manage/page.tsx`.

**Verified** — /manage forwards to /channels; ticking two rows showed the
bulk bar; Pause then Resume, and Move to Finance then back to each original
genre, all applied and were undone; the genre panel's counts followed
(Finance 0 → 2 → 0). Delete… showed the confirm sentence and Cancel backed
out. Interview in the panel narrowed to its 5 channels; Quiet showed the one
channel with no stored uploads; sorting by last upload put the newest first.
"+ Add channel" focused the box. No console errors; production build passes.

### UI — visual problems

**Added 2026-10-17 (after Phase 9): sort by genre.** The Genre header now
sorts like Channel, Videos and Last upload. It groups the channels by genre
(A→Z, or Z→A on a second click), keeps "No genre" last either way, and keeps
channels A→Z inside each group, so the table reads like a grouped list.
*Why:* filtering by a genre (the Genres panel) shows one genre at a time;
sorting shows all of them grouped, which helps when tidying (a channel filed
under the wrong genre, a genre with too many channels). *Status* stays
unsortable on purpose: the All / Quiet / Paused buttons already filter by it,
and there are only three statuses. Changing a row's genre while sorted by
genre moves that row into its new group straight away. Code: the `"genre"`
`SortKey` in `ChannelsClient.tsx`. Verified both directions in the running
app.

#### UI-01 · Design tokens in one place — ✅ done · 2026-10-16
**The problem**
The app's colours lived in a handful of loosely named variables (`--paper`,
`--yellow`, `--accent`…) plus hard-coded values like `#fff` scattered through
components. Nothing tied them to the design, so the palette had drifted —
the yellow was `#ffc900` where the design uses `#ffd02b`, cards were pure
white instead of warm off-white — and every corner was rounded while the
design is square.

**The change**
Every design value now has one name and one definition: the colours, the
three shadow sizes, square corners and the number font. Changing a colour
anywhere in the app means changing one line.

**How it works**
Tailwind 4 has a special block in the stylesheet, `@theme`, for exactly this.
Anything declared there does two jobs at once: it becomes a normal CSS
variable, *and* Tailwind generates ready-made classes from it. Declaring
`--color-surface: #fffaf0` means components can simply write `bg-surface`,
`text-ink` or `border-ink`, and those always mean the design's values.

Corners use the same trick. Tailwind's `rounded-lg`, `rounded-xl` and friends
all read their size from theme variables, so setting those variables to `0`
squares every corner in the app — about 150 places — without touching a
single component. `rounded-full` is calculated differently and stays round,
which is what circular avatars need. (Today's pill-shaped chips also stay
round until their screens are redesigned in later phases.)

The old variable names didn't disappear: they became aliases that point at
the new tokens (`--yellow` now means `--color-primary`, and so on). Every
existing screen switched to the refined palette instantly, without being
edited, and new code uses the new names.

The dot grid on the background stays, at half its old strength.

**Key code** — `app/globals.css`
```css
@theme {
  --color-ink: #15130f;       /* becomes text-ink, border-ink, bg-ink */
  --color-primary: #ffd02b;   /* becomes bg-primary */
  --color-surface: #fffaf0;   /* becomes bg-surface */
  --shadow-hard: 3px 3px 0 var(--color-ink);   /* becomes shadow-hard */
  --radius-lg: 0;             /* rounded-lg is now square… */
  --font-mono: var(--font-space-mono), ui-monospace, monospace;
}
:root { --yellow: var(--color-primary); }      /* old name → new token */
```
The full list (13 colours, 3 shadows, corners, font) is at the top of the file.

**Alternatives considered**
- *Search-and-replace every colour and `rounded-*` class across components* —
  hundreds of edits for the same result, and nothing would stop values drifting
  again.
- *A separate Tailwind config file* — Tailwind 4 moved this job into the CSS
  `@theme` block; a config file would be the older, deprecated route.

**Files** — `app/globals.css`

**Verified** — in the running app: page background `rgb(251,241,221)`, primary
button `#ffd02b`, every element's corner radius `0px` (no rounded elements
left except intentional circles), cards on the off-white surface colour.

#### UI-02 · Visual hierarchy: heavy only where it matters — ✅ done · 2026-10-16
**The problem**
Every card had a 3px border and a 6px shadow, every input a 4px shadow, and
the hover state went up to 8px. With everything shouting, the yellow primary
button didn't stand out from a plain card.

**The change**
Outlines are 2px everywhere. Normal cards, chips and inputs cast a 3px
shadow; small inner panels 2px. Only the yellow primary button keeps a
heavier 4px shadow (5px on hover), and a hovered card lifts to 5px instead of
8px. Inputs now glow yellow when focused, instead of red.

**How it works**
The site's building blocks (`nb`, `nb-btn`, `nb-chip`, `nb-input` in the
stylesheet) are used by every screen, so changing their border and shadow
values re-weights the whole app in one go. They now take their shadows from
the three shared sizes defined in UI-01 rather than their own numbers, so the
hierarchy stays consistent as screens are rebuilt.

**Key code** — `app/globals.css`
```css
.nb     { border: 2px solid var(--color-ink); box-shadow: var(--shadow-hard); }
.nb-btn { border: 2px solid var(--color-ink); box-shadow: 4px 4px 0 var(--color-ink); }
.nb-btn:hover { box-shadow: var(--shadow-hard-lg); }   /* 5px — the heaviest */
```

**Alternatives considered**
- *Leave the old classes and only restyle as each screen is rebuilt* — the app
  would look inconsistent for weeks, half old and half new.

**Files** — `app/globals.css`

**Verified** — feed cards measure 2px border and 3px shadow; the primary
button 4px; Feed, Manage, Notebook and Tracks all load with no console errors.

#### UI-05 · Shared building blocks — ✅ done · 2026-10-16
**The problem**
Every screen built its own buttons, toggles and lists from scratch, so the
same idea looked slightly different on each page — and the redesign needs the
same pieces on every screen.

**The change**
Five reusable components in `components/ui/`, plus a style guide page that
shows them all. Later phases build screens from these instead of from
scratch.

| Component | What it's for |
|---|---|
| `Button` | Primary (yellow), secondary (outlined) and ghost buttons, two sizes. `buttonClass()` gives a link the same look. |
| `IconButton` | Square icon with an **instant** hover label, an "active" filled state, and an optional number badge or dot. |
| `SegmentedControl` | A row of exclusive choices in one frame (Videos \| Shorts, length). |
| `SidebarList` | `SidebarSection` + `SidebarItem` for the feed's left sidebar. |
| `SidePanel` | The right-hand panel: fixed header, actions and tabs; scrolling body. |

**How it works**
The icon button's hover label is the one already used on shorts, made
reusable. The browser's built-in `title` tooltip waits about a second before
appearing; ours is a small label inside the button that's hidden until the
mouse is over it, so it shows immediately. It also appears when the button is
reached with the keyboard, and the button carries an `aria-label`, so screen
readers announce it.

The segmented control and sidebar items are built for accessibility from the
start: the control is announced as a group of radio choices with the current
one checked, and the active sidebar item is marked as "current".

The **style guide** (`/styleguide`, behind the login like every page) shows
the colours, type and every component working, so the foundation can be
reviewed before any real screen uses it.

**Key code** — `components/ui/IconButton.tsx`
```tsx
<button aria-label={label} className="group relative …">
  {children}                                      {/* the icon */}
  <span className="… hidden group-hover:block group-focus-visible:block">
    {label}                                       {/* instant hover label */}
  </span>
</button>
```

**Alternatives considered**
- *A component library (shadcn/ui, Radix…)* — capable, but it brings its own
  look we'd have to fight to stay neobrutalist, plus dependencies for five
  small pieces.

**Files** — `components/ui/Button.tsx`, `IconButton.tsx`,
`SegmentedControl.tsx`, `SidebarList.tsx`, `SidePanel.tsx`;
`components/StyleguideClient.tsx`, `app/styleguide/page.tsx`

**Verified** — style guide checked in the running app: hover label appears
instantly, badge and dot render, active state fills black, segmented controls
and sidebar switch correctly, panel opens and closes.

#### UI-06 · Icons and warmth (Phase 3 review fixes) — ✅ done · 2026-10-16
**The problem**
The owner's review of Phase 3: the sync icon was a typed character (⟳) that
looked cheap, and its hover label was cut off at the top of the page; the app
had lost its yellow, retro feel; "Load more" had become a plain outlined
button; the tool icons looked "drawn with a light pen", with no depth; and
the text under "Inbox" was too faint.

**The change**
- **Icons:** one drawn set in the "sticker duotone" style: a heavier ink
  outline (2.5px, up from 2px) with a yellow fill inside closed shapes. The
  rules are in §2 *Icons*. The sync button uses the drawn refresh icon, its
  label opens below, and it spins while syncing.
- **Warmth, in measured doses:** the top bar and sidebar sit on a soft warm
  cream (`panel`); the selected sidebar row is solid yellow; counts are yellow
  badges again; the page's dot grid is back to its original strength.
- **Load more** is the yellow primary button again, with a down chevron.
- **Text:** the line under the title, card metadata and sidebar headings are
  darker and bolder.

**How it works**
Phase 1 had made each element quieter on its own (outlined buttons, grey
counts, fainter dots), and together that drained the yellow out. The fix puts
yellow back where the eye lands (selection, counts, the one main button,
inside icons) rather than everywhere, as the old design did.

*A first pass went too far:* pale yellow (`#fff3c4`) on the bars and a
warmer page read as "urine yellow" to the owner. So the bars got their own,
softer token, `panel` (`#fff6de`), and the page went back to `#fbf1dd`.

*How duotone is drawn:* each icon is two layers. The bottom layer repeats
the icon's closed outline, filled yellow and with no line; the top layer is
the normal ink outline. Drawing the fill first means the outline always sits
crisply on top.

**Key code** — `components/ui/Icon.tsx`
```tsx
// Yellow layer first (closed shapes only), then the ink outline on top.
{duotone && !filled && FILLS[name]?.map((d) => <path d={d} className="fill-primary" stroke="none" />)}
{PATHS[name].map((d) => <path d={d} />)}
```

**Alternatives considered**
- *A — bold line only* (what Phase 3 first shipped, thickened): clean, but the
  owner found it lacked depth and the retro feel.
- *C — 8-bit pixel icons*: the most retro, but pixel icons are only sharp at
  fixed sizes (12/24/36px) and clash with the smooth type. Proper pixel sets
  exist (e.g. Pixelarticons); the preview used hand-drawn samples.
- *An icon library (Phosphor duotone)*: popularised the two-layer look, but
  its second layer is a faint grey. Ours uses the brand yellow and needs no
  new dependency.

**Files** — `components/ui/Icon.tsx`, `components/ui/IconButton.tsx`
(`tipBelow`), `components/ui/SidebarList.tsx`, `components/ui/SidePanel.tsx`
(drawn ✕), `components/TopBar.tsx`, `components/VideoCard.tsx`,
`components/FeedClient.tsx`, `app/globals.css` (`panel`, dots)

**Verified** — the sync label "Check YouTube for new videos" shows in full
below the button; strip icons show the yellow fill (track and refresh stay
ink; the corner bookmark stays an outline until saved); Load more is yellow
with a chevron; production build passes.

**Done everywhere (Phase 6, 2026-10-17)** — the last typed icons went with
the Tracks rebuild, and the shared video player's "✕ CLOSE" became a drawn
✕ with an instant "Close (Esc)" label (its header now shows channel and
length, and "Resumed at 12:30 · Start over" is a normal button). No screen
uses a typed character or emoji as a control any more; the style guide
keeps the old emoji only as reference.

#### UI-03 · Consistent page layout — ✅ done · Feed 2026-10-16 · every screen 2026-10-17 (Phase 9)
**The problem**
Feed, Manage, Notebook and Tracks each had a different header and layout:
titles of 26, 30 and 34px, summaries in different fonts, controls placed
differently, and sticky columns starting at different heights.

**The change**
Every screen shares the top bar and the same page-title pattern: a 40px
title with its pen note, a one-line summary in muted text, controls on the
right. Two-pane screens (Notebook, Tracks) put the same title at the top of
their left column.

**How it works**
A shared `components/ui/PageTitle.tsx` takes `title`, `note`, `summary` and
the controls as children, and lays them out in two rows that wrap on
narrow screens. Feed, Channels and the style guide use it. Notebook and
Tracks repeat the same classes in their left column, because there the
title shares a row with the column's own buttons (⋯, New track). Every
sticky column starts at 65px, the top bar's height.

**Key code** — `components/ui/PageTitle.tsx`
```tsx
<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
  <h1 className="font-display text-display">{title}</h1>
  {note && <span className="pen-note">{note}</span>}
</div>
```

**Alternatives considered**
- *Force Notebook and Tracks into the same full-width header:* it would push
  the two panes down and waste the left column's top.
- *Leave each screen's header as it was:* the inconsistency was part of the
  "vibe-coded" feel.

**Files** — `components/ui/PageTitle.tsx` (new), `FeedClient`,
`ChannelsClient`, `StyleguideClient`, `NotebookClient`, `TracksClient`
(column titles, `top-[65px]`).

**Verified** — every screen opens on a 40px title with its pen note and the
same spacing; the sidebars and panels stay put under the bar when scrolling
(checked on the feed and Notebook at 1440px).

#### UI-04 · Sentence case for controls — ✅ done · Feed 2026-10-16 · every screen 2026-10-17 (Phase 9)
**The problem**
Almost every label was in capitals ("+ NEW", "COPY", "MY NOTE", "UP NEXT ·
STEP 3"), which is slower to read and reads as shouting.

**The change**
Buttons, tabs and messages in sentence case; capitals only for the logo and
small section labels ("YOUR FEED", "GENRES"), which are shown in caps by CSS.

**How it works**
Labels are written in normal sentence case in the code. The small-label
style (Space Mono, 12px, bold, letter-spaced, `uppercase`) turns them into
caps on screen. So a screen reader reads "Your feed", not "Y-O-U-R", and
changing the style later is one class, not a rewrite of every string.

**Key code** — the small-label style, used for section labels and chips
```tsx
<h3 className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-muted">{title}</h3>
```

**Alternatives considered**
- *Keep caps in the strings:* screen readers may spell them out, and every
  label would need retyping to change the style.
- *No caps at all:* the small labels lose their retro "printed label" feel,
  one of the accents we keep on purpose.

**Files** — `components/ui/SidebarList.tsx`, `TrackMenu`, `CopyButton`,
`FeedClient` (player queue label), `NotebookClient` ("My note", "Gemini"),
`TracksClient` ("Up next · step 3", "Track · Tech"), `ChannelsClient`
(table headers), `GlobalSearch` (section titles), `AskSuggestionsEditor`.

**Verified** — a search of `components/` finds no all-caps labels in the
strings except the logo; section labels still show in caps on screen.

#### UI-07 · Calm base, retro accents — ✅ done · 2026-10-17 (Phase 9)
**The problem**
After Phases 1–8 the app worked well but looked "vibe-coded". Measured: 15
colour tokens (7 near-identical creams), 8 shades of secondary text, a 2px
black border in 70 places, a hard shadow at rest in 25, 7+ text sizes plus
one-offs. Every element was equally loud, so nothing stood out and nothing
felt clickable.

**The change**
Apply §2 *v2* to every screen: one cream, one muted grey, 1px soft lines,
6–10px corners, six text sizes, no dot grid. Hard shadows only on the main
button at rest and on a card while it's hovered (it lifts). The retro
identity stays in a few chosen places: mascot, Archivo Black titles, Space
Mono numbers and labels, the sticker button, and the marker and pen
(REF-07). Ideas and sources: §2 *v2 → Where the ideas came from*. (The
preview page used while designing was removed after the build;
`/styleguide` shows the result.)

**Alternatives considered**
- *Keep Phases 1–8's look and only fix details:* doesn't address the cause
  (no fixed scale, everything heavy).
- *Switch to a soft, non-retro style like Dan's site:* loses TUBEBOX's
  identity; the owner wants to keep retro.
- *Copy neobrutalism.dev as is:* shadows at rest on everything, the same
  loudness we're leaving.

**How it works**
Think of it as moving from "everything shouts" to "the page whispers until
you reach for something". Three mechanisms do most of the work:

1. *One set of values, and nothing else exists.* `app/globals.css` declares
   the v2 colours, the six text sizes and the four corner sizes in Tailwind's
   `@theme`, and first wipes Tailwind's own lists with `--color-*: initial`,
   `--text-*: initial`, `--radius-*: initial`. So a stray `text-[11px]`,
   `bg-tint` or `rounded-xl` doesn't just look off: it stops existing.
   That's what keeps the app from drifting back to "vibe-coded".
2. *The old helper classes were redefined, not hunted down.* `.nb`,
   `.nb-input`, `.nb-chip` and `.nb-btn` are used all over; giving them v2
   values (1px soft line, rounded, no shadow; the button stays the sticker)
   moved every screen at once.
3. *The hard shadow became a reward.* The `.lift` class keeps a card flat
   with a soft line; on hover it moves 3px up-left, its border turns ink and
   the 5px shadow appears. The same retro shadow, now saying "you can open
   this".

Then each screen was gone through by hand: 2px ink borders → 1px `line`,
eight greys → `muted`, one-off sizes → the scale, `tint` highlights →
`surface` or a light yellow, and the busy states → the spinner (UI-08).

**Key code** — `app/globals.css`
```css
@theme {
  --color-*: initial;          /* only our colours exist */
  --color-cream: #fbf6ec;      /* page, top bar, sidebar: one cream */
  --color-muted: #6f675b;      /* THE secondary-text colour */
  --color-line: rgb(26 23 18 / 0.13);
  --text-*: initial;           /* only our six sizes exist */
  --text-meta: 0.8125rem;      /* 13 */
  --shadow-sticker: 3px 3px 0 var(--color-ink);
  --shadow-lift: 5px 5px 0 var(--color-ink);
}
.lift:hover { transform: translate(-3px, -3px); border-color: var(--color-ink); box-shadow: var(--shadow-lift); }
```

**Files** — `app/globals.css`, `app/layout.tsx` (Caveat), `lib/format.ts`
(`formatWatchTime`), `components/ui/*` (Button with `busy`, IconButton with
`ghost`, SegmentedControl, SidebarList with `SidebarTile`, SidePanel, new
`PageTitle`), and every screen: `TopBar`, `FeedSidebar`, `FeedClient`,
`VideoCard`, `StudyPanel`, `PlayerModal`, `GlobalSearch`, `NotebookClient`,
`TracksClient`, `ChannelsClient`, `GenresPanel`, `TrackMenu`, `NoteEditor`,
`CopyButton`, `Markdown`, `AskSuggestionsEditor`, `GenreColorPicker`,
`LoginForm`, `StyleguideClient`. Removed: `components/Emoji.tsx` (no screen
used typed emoji any more).

*Lesson from review:* `overflow-hidden` for rounded corners also clips
hover labels and menus. Round the first and last rows instead
(`first:rounded-t-[9px]`), and give hover labels a named group so a
hover-group around them can't open them all.

**Verified** — a sweep of `components/` and `app/` finds no 2px ink borders,
no `shadow-hard*`, no retired colours and no one-off text sizes (the only
2px border left is the study panel's active-tab underline, on purpose).
Typecheck, lint and production build pass; the built CSS contains the v2
tokens and none of the retired ones. Checked in the running app at 1440,
1280, 1024 and 375px wide: feed, shorts, study panel, search, Notebook,
Tracks, Channels, style guide. Two fixes came out of that: the top bar wrapped
onto two rows at 1024px (so its words now hide below 1280px), and on phones
the tabs ran off-screen (they now get their own row).

#### UI-08 · Phosphor duotone icons — ✅ done · 2026-10-17 (Phase 9)
**The problem**
The icons are hand-drawn (`components/ui/Icon.tsx`), 2.5px and yellow-filled
everywhere. Next to a professional set they look home-made, and the yellow
on every icon makes them all compete.

**The change**
Swap the drawings inside `Icon.tsx` for Phosphor's duotone set and keep the
component's API, so screens change little. Icons are quiet at rest (muted
outline, 20% fill). On hover they turn ink with a solid yellow fill on a soft
tile, and they stay lit while "on". Open shapes (refresh, check, plus,
arrows) never fill; the refresh icon turns 90° on hover. Every wait uses one
spinner with a word ("Syncing", "Thinking…"), from neobrutalism.dev's
Spinner. Mapping and rules: §2 *v2 → Icons* and *Waiting*.

**Alternatives considered** — compared side by side in the preview's
"Icon sets compared":
- *Heroicons* (what Dan's site uses): clean, but outline-only, so no yellow
  inside.
- *Lucide* (neobrutalism.dev's set): same limitation, and a heavier 2px line.
- *Keep our hand-drawn set:* consistent in style only by effort; the gap to
  a designed set shows.
- *Install `@phosphor-icons/react`* instead of copying shapes: one more
  dependency for 27 icons, and its components would have to be wrapped
  anyway to keep our `Icon` API and the yellow lighting. Copying the shapes
  (MIT, with the notice kept) was chosen.

**How it works**
Each Phosphor duotone icon is two layers drawn on a 256×256 grid: a soft
inner shape (marked `opacity="0.2"` in Phosphor's files) and the outline on
top. A small script downloaded the 27 icons we use from
`@phosphor-icons/core` and wrote their shapes into `components/ui/iconPaths.ts`,
split into `fill` (the inner layer) and `line` (the outline). `Icon.tsx`
draws both, in the current text colour.

The yellow is pure CSS, which is why one rule covers every screen:
- `.icon-fill` keeps the inner layer at 20%: a faint tint.
- `.icon-lit`, or any hovered button marked `icon-hover`, turns it solid
  yellow. Like a light switch on the button around the icon: buttons opt in
  with one class.
- `lit` on the icon means "on" (the card's bookmark when saved, Ask when it
  has answers, the note icon when a note exists): it stays yellow.
- Open shapes (check, ✕, arrows, refresh, the spinner) come from Phosphor's
  bold/regular weights, which have no inner layer, so there's nothing to
  turn yellow.

Waiting uses `components/ui/Spinner.tsx`: the `spinner` icon
(`circle-notch`) turning every 0.75s via `animate-spin` (slower with
reduced motion), always with its word. `SpinnerBadge` is the bordered
version for the top bar's "Syncing". `Button` has `busy` / `busyLabel`, so a
busy button shows "◌ Saving…" and disables itself in one prop. The top
bar's refresh icon turns 90° on hover and no longer spins while syncing.

**Key code** — `components/ui/Icon.tsx`, `app/globals.css`
```tsx
// Inner layer first (lit = solid yellow), then the outline on top.
{(duotone || filled) && shape.fill?.map((d) => <path d={d} className={layer} />)}
{shape.line.map((d) => <path d={d} />)}
```
```css
.icon-fill { opacity: 0.2; }
.icon-lit, .icon-hover:hover .icon-fill { fill: var(--color-primary); opacity: 1; }
```

**Files** — `components/ui/iconPaths.ts` (new, generated; MIT notice at the
top), `components/ui/Icon.tsx` (rewritten; `strokeWidth` prop removed, `lit`
added), `components/ui/Spinner.tsx` (new), `components/ui/Button.tsx`
(`busy`), `app/globals.css` (`.icon-fill`, `.icon-lit`, `.icon-hover`,
`--animate-spin`), and every caller (the old `strokeWidth` props removed;
the note dot replaced by a lit icon; "Loading…/Thinking…/Saving…" texts
replaced by the spinner).

**Verified** — the style guide shows all 27 icons at rest and lighting up on
hover; strip icons on the feed cards all fill on hover (the three poor
fillers were swapped for `article`, `notepad`, `stack-plus`); the saved
bookmark shows yellow inside a white corner; the refresh icon turns on
hover and never fills; "Syncing" badge, "Thinking…" and a busy button render
in the style guide. On narrow short cards the Ask button was being squeezed
to 18px, overlapping its neighbour; the tool row now tightens on narrow
cards (measured: 30 + 4×28px fits the 166px row).

### REF — refinements

#### REF-01 · Logo with a hover tagline — ✅ done · 2026-10-16
**The problem**
The tagline "your feed · no algorithm" sat under a 72px logo on the feed only,
taking a whole header row for something you read once.

**The change**
The TV mascot (eyes still follow the cursor) and "TUBEBOX" form the logo at
the left of the bar. Hovering it, or reaching it with the keyboard, shows a
small speech bubble from the TV: "your feed · no algorithm". It just appears,
with no animation. Clicking the logo goes to the feed.

**How it works**
Same trick as the icon buttons' hover labels (UI-05): the bubble is always in
the page but hidden, and shown while the logo is hovered or focused. The
bubble's little pointer is a small square, rotated 45° and outlined on two
sides, so it reads as a triangle poking up toward the TV.

**Key code** — `components/TopBar.tsx`
```tsx
<Link href="/" className="group relative …">
  <Mascot size={40} /> TUBEBOX
  <span role="tooltip" className="… hidden group-hover:block group-focus-visible:block">
    <span className="… rotate-45 border-l-2 border-t-2" />  {/* the pointer */}
    your feed · no algorithm
  </span>
</Link>
```

**Alternatives considered**
- *Keep the tagline as visible text next to the logo*: it costs width in a
  bar that's already full, and you only need to read it once.

**Files** — `components/TopBar.tsx`

**Verified** — hovering the logo shows the bubble immediately (no
transition), placed under the TV; it hides when the mouse leaves.

#### REF-02 · Human wording — ✅ done · Feed 2026-10-16 · every screen 2026-10-17 (Phase 9, REF-08)
**The problem**
Labels and messages were written the way the code names things ("TEXT",
"RE-SYNC", "NOTHING HERE YET", an error about serverless functions timing
out), not the way a person would say them.

**The change**
Rename internal-sounding labels and rewrite messages as a person would say
them:

| Today | New |
|---|---|
| INBOX / EVERYTHING / HISTORY | Inbox / Everything / Watched (sentence case, as places) |
| 📄 TEXT | Transcript |
| RE-SYNC | **Backfill 1Y–5Y** (FEAT-10): says what it does, and can reach further back |
| "…serverless functions time out before a watch finishes…" | "This video has no captions, so it can't be read here. Open it on your laptop once — after that it works everywhere." |
| NOTHING HERE YET (empty inbox) | "You're all caught up" |

**How it works**
Text changes in place, screen by screen as each phase landed; Phase 9's
wording pass (REF-08) finished the remaining screens and added the "to
watch" summary.

**Key code** — no logic of its own; see REF-08 for `formatWatchTime()`.

**Alternatives considered**
- *Keep the technical messages, since they're accurate:* accurate but not
  useful; a person needs what to do next, not why the server failed.

**Files** — as listed under REF-08, plus `lib/gemini.ts` (the no-captions
message) and `ChannelsClient` (Backfill).

**Verified** — every screen read through at the end of Phase 9; no labels
left in the old style (see UI-04).

#### REF-03 · Space Mono for numbers — ✅ done (font installed) · 2026-10-16
**The problem**
Counts, durations and times were set in the same proportional font as the
text, where a "1" is narrower than an "8". Columns of numbers (counts in a
list, durations on cards) wobbled instead of lining up.

**The change**
Space Mono is loaded alongside the two existing fonts. Writing `font-mono` on
any element now uses it — counts, durations, timestamps and "Synced 4 min ago"
switch to it as their screens are rebuilt.

**How it works**
Next.js downloads the font at build time and serves it from TUBEBOX itself
(`next/font`), so there's no request to Google when a page loads — the same
way Space Grotesk and Archivo Black are already loaded. Every Space Mono
character is the same width, which is why columns of numbers line up.

**Key code** — `app/layout.tsx`
```ts
const mono = Space_Mono({ variable: "--font-space-mono", weight: ["400", "700"] });
```
`globals.css` maps Tailwind's `font-mono` to `--font-space-mono` (see UI-01).

**Alternatives considered**
- *Tabular figures in the existing font* (`font-variant-numeric:
  tabular-nums`): lines digits up without a new font, but Space Grotesk's
  support is partial and it loses the typewriter feel that suits the retro
  look.
- *The system's monospace font*: free, but looks different on Mac and
  Windows.

**Files** — `app/layout.tsx`, `app/globals.css`

**Verified** — the style guide's number line renders in "Space Mono".

#### REF-04 · Loading placeholders — ✅ done · 2026-10-16
**The problem**
"LOADING…" in the middle of the page, and the old grid staying put until the
new one arrived, so clicks felt ignored on a slow connection.

**The change**
While a new set of videos loads, the grid shows grey placeholder cards of the
same shape (8 for videos, 12 for shorts); "Load 24 more" adds 4 at the end.

**How it works**
Loading now knows *what* is loading: "first" replaces the grid with
placeholders, "more" appends them. Each request also takes a ticket number,
and only the newest ticket may update the screen. Without that, clicking
Inbox then quickly History could show Inbox's results last if they happened
to arrive later.

**Key code** — `components/FeedClient.tsx` → `loadPage()`
```ts
const id = ++requestId.current;         // take a ticket
// … await the response …
if (id !== requestId.current) return;  // a newer request owns the screen
```

**Alternatives considered**
- *A spinner*: says "wait" but not what's coming; the page still jumps when
  the cards arrive.
- *Keep the old grid until the new one loads*: no jump, but on a slow
  connection the click looks ignored, and you can end up acting on the
  wrong videos.
- *Cancel the old request* (`AbortController`) instead of ignoring its
  answer: also works; the ticket is simpler and leaves nothing to clean up.

**Files** — `components/FeedClient.tsx` (`SkeletonCard`)

**Verified** — placeholders appear on view/genre changes and before more
loads; quick clicks end on the last choice.

#### REF-05 · Remove the ticker — ✅ done · 2026-10-16
**The problem**
A banner scrolling "NO ALGORITHM · STAY FOCUSED…" forever sat above the feed.
Something moving at the edge of your eye is a distraction, the opposite of
what it said.

**The change**
Removed, along with its styles and animation. The logo's speech bubble
(REF-01) keeps the personality.

**How it works**
Nothing replaces it: the phrase list, the banner and its CSS (the `marquee`
animation, `.ticker-track`, `.nb-ticker`) are deleted, not hidden.

**Key code** — nothing added; this is what was removed from `app/globals.css`:
```css
@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
.ticker-track { animation: marquee 30s linear infinite; }
```

**Alternatives considered**
- *Keep it but stop the scrolling*: a static strip of slogans is just
  clutter between the bar and the feed.
- *Hide it with CSS*: dead code that someone later wonders about; deleting
  is cleaner, and git keeps the history.

**Files** — `components/FeedClient.tsx`, `app/globals.css`

**Verified** — no ticker element on the feed; no remaining references to
`ticker` or `marquee` in the code.

#### REF-06 · Empty states that say what to do next — ✅ done · feed 2026-10-16 · every screen 2026-10-17 (Phase 9)
**The problem**
An empty screen showed a bare "Nothing here" (or nothing at all), without
saying why or what to do.

**The change**
Each empty screen names the place and offers the next step. The feed's, most
specific reason first: no channels yet ("+ Add channel"), search with no
matches ("Clear search"), nothing at that length ("Any length"), Watch later
empty ("Use the bookmark on any card"), Inbox empty ("You're all caught up"
→ "See everything", with the pen note "nothing new. go outside?"), Watched
empty. Notebook: "Your notebook is empty" (pen note "every answer you keep
lands here"), and "No matches" → "Clear filters". Tracks: "Start your first
track", "This track is empty", "Track complete". Channels: "Add your first
channel", "No channels match" → "Show all channels".

**How it works**
The feed checks the reasons in order of how specific they are, and the
first that applies wins: no channels at all beats a search miss, which
beats a length filter, and so on. So the message is always about the thing
you can actually change. Every empty state is the same calm card (1px line,
10px corners, no shadow), with at most the one pen note of that screen.

**Key code** — `components/FeedClient.tsx` `renderEmptyState()`
```tsx
if (channels.length === 0) { title = "No channels yet"; /* + Add channel */ }
else if (debouncedSearch) { title = "No matches"; /* Clear search */ }
else if (kind === "videos" && lengthFilter !== "any") { /* Any length */ }
else if (view === "unwatched") { title = "You're all caught up"; note = "nothing new. go outside?"; }
```

**Alternatives considered**
- *One generic "Nothing here" with a reset button:* simpler, but it hides
  why the list is empty.

**Files** — `components/FeedClient.tsx`, `NotebookClient`, `TracksClient`,
`ChannelsClient`.

**Verified** — the feed's search and length cases show their own message
and button; Notebook, Tracks and Channels empty cards render in the v2 card
style (checked by reading each branch; a real empty Notebook would mean
deleting the owner's answers, so that one wasn't forced).

#### REF-07 · The marker and the pen — ✅ done · 2026-10-17 (Phase 9)
**The problem**
With Phase 9's calmer base, the app needs a few memorable touches, the way
Dan's site has its terminal touches and handwritten notes, without
copying them.

**The change**
Two hand-drawn tools with one job each (§2 *v2 → The marker and the pen*):
- **Yellow marker:** a slightly tilted felt-tip stroke under the active tab
  in the top bar, and faintly under a tab you hover. It replaces the active
  tab's solid black box.
- **Blue pen:** one handwritten note (Caveat) beside each page title, from
  the table in §2, including the empty inbox.

**Alternatives considered**
- *A greeting with a pen swoosh under the name* (tried in the preview): too
  close to Dan's dashboard, and it needs the owner's name stored. Parked as
  FEAT-11.
- *A straight yellow highlighter bar under the active tab* (the first
  preview): fine, but the hand-drawn stroke matches the pen.
- *Blue for both:* blue would stop being special; yellow already means
  "selected" across the app.

**How it works**
*The marker* is a tiny SVG drawn inside each tab's word: one curved path,
stretched to the word's width (`preserveAspectRatio="none"`) but with
`vector-effect="non-scaling-stroke"`, so a long word gets a longer stroke,
not a fatter one. It's invisible by default. The tab that's the current page
(`aria-current="page"`) shows it fully; hovering any other tab shows it at
45%. The same attribute screen readers use to announce "current page" is
what draws the marker, so the look and the meaning can't disagree.

*The pen* is the Caveat font (loaded with `next/font` like the others) in a
`.pen-note` class: blue, 23px, tilted −2.5°, never wrapping. Pages pass it
as `PageTitle`'s `note`; Notebook and Tracks place it beside their column
title. One per screen, so Tracks' "Track complete" card has no second note.

**Key code** — `components/TopBar.tsx`
```tsx
<svg viewBox="0 0 100 12" preserveAspectRatio="none"
  className="… opacity-0 group-hover:opacity-45 group-aria-[current=page]:opacity-100">
  <path d="M3 8.5 C 28 4.5, 62 3.5, 97 5.5" stroke="var(--color-primary)"
    strokeWidth="5.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
</svg>
```

**Files** — `components/TopBar.tsx` (`MarkerStroke`), `app/layout.tsx`
(Caveat as `--font-caveat`), `app/globals.css` (`.pen-note`, `--font-pen`,
`--color-pen`), `components/ui/PageTitle.tsx` (`note`), `FeedClient`
(`VIEW_NOTES`, Shorts note, empty-inbox note), `NotebookClient`,
`TracksClient`, `ChannelsClient`, `StyleguideClient`.

**Verified** — the stroke sits under Feed, Notebook, Tracks and Channels as
each is opened, and appears faintly on hover; on phones the tabs' row leaves
room so the stroke isn't clipped. Pen notes render beside every page title
in the table in §2, one per screen.

#### REF-08 · Wording pass — ✅ done · 2026-10-17 (Phase 9)
**The problem**
Labels were written the way a coder names things ("unseen", "History",
"Show all 13"), and the two search boxes looked like duplicates.

**The change**
Written as a copy person would: say what to do, name the thing. Also
finishes REF-02 on every screen.

| Where | Today | New | Why |
|---|---|---|---|
| Under the page title | 699 unseen · 261h 10m · newest first | 699 to watch · about 261 hours | "to watch" says what to do; the sort order moves into the pen note |
| Sidebar group | Views | Your feed | It's yours |
| Sidebar views | Inbox, Later, History, Everything | Inbox, Watch later, Watched, Everything | "History" was really "Watched" |
| Page search | Search titles | Filter this list | No longer looks like a second top search |
| Channel link | Show all 13 → | All 13 channels → | Names the thing |
| Length filter | < 10m · 30m + | <10m · 30m+ | No stray gaps |
| Sync status | Synced 3 h ago | Synced 3h ago (body font) | Sentence case; mono spacing made it gappy |
| Top search | Search everything | (unchanged) | It does cover channels, videos, answers and notes |

**How it works**
Mostly text changes in place. Two small pieces of logic:
- *"about 261 hours"*: a new `formatWatchTime()` in `lib/format.ts` rounds
  long totals to whole hours ("about 261 hours") and keeps short ones exact
  ("3h 20m"). Nobody plans by the minute across 200 hours.
- *Sort order moved into the pen note*: the summary line no longer ends
  "· newest first"; the Inbox's note says "newest first, no algorithm".

Also changed while going through every screen (REF-02's list, finished):
"Later" → "Watch later" and "History" → "Watched" (sidebar and page
titles), "Remove from Later" → "Remove from Watch later", "Search answers,
notes, titles" kept, "+ NEW" → "New", "Show all N →" → "All N channels",
"Synced 3 h ago" → "Synced 3h ago", the player's "SHORT 3 OF 40 UNSEEN" →
"Short 3 of 40 unseen".

**Alternatives considered**
- *Keep exact totals ("261h 10m")*: precise, but nobody plans by the minute
  across 200+ hours; the round number reads faster.
- *Rename "Inbox" itself* (to "To watch"): "Inbox" is a well-known idea and
  the summary line already says "to watch".

**Key code** — `lib/format.ts`
```ts
export function formatWatchTime(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  return hours >= 10 ? `about ${Math.round(hours)} hours` : formatTotalTime(totalSeconds);
}
```

**Files** — `lib/format.ts`, `components/FeedClient.tsx` (`VIEW_TITLES`,
`subtitle()`), `FeedSidebar`, `VideoCard`, `TopBar` (`syncedLabel`),
`GlobalSearch`, `TrackMenu`, `CopyButton`, `PlayerModal`, `TracksClient`,
`NotebookClient`, `ChannelsClient`.

**Verified** — the feed reads "Inbox · newest first, no algorithm · 699 to
watch · about 261 hours"; the sidebar shows Your feed → Inbox, Watch later,
Watched, Everything; the filter box says "Filter this list"; the length
control reads <10m · 10–30m · 30m+; the top bar reads "Synced 3h ago".

#### REF-09 · The logo's tagline in the pen; "See its videos" after adding a channel — ✅ done · 2026-10-17
**The problem**
- Hovering the logo showed "your feed · no algorithm" in a plain grey
  label, so the one line that says what the app stands for looked like any
  other tooltip.
- Adding a channel ended with "Added X, with N videos…", and then you
  had to go to the feed and find the channel in the sidebar to see what
  came in.

**The change**
- The logo's hover bubble writes the tagline in the blue pen (REF-07's
  `.pen-note`, at 18px, smaller than a title's 23px note) as "your feed, no
  algorithm", in a small cream card with an ink edge, the sticker shadow
  and a pointer up to the logo. It starts under the word TUBEBOX (80px in),
  so it never covers the sidebar's "Your feed" heading.
- The "Added…" message ends with **See its videos →**, a link to
  `/?channel=<id>`. It opens the feed on Everything, filtered to that
  channel.
- "Add channel" keeps its name. It describes what the button does; managing
  channels already has its own tab (Channels), and "Back to feed" is the
  Feed tab.

**How it works**
- The bubble is still the CSS-only hover from REF-01: it's hidden until the
  logo link is hovered or focused (`group-hover:block`,
  `group-focus-visible:block`). Only what's inside it changed.
- The pen rule "one per screen" applies to what's always on screen; this
  one shows only while you point at the logo.
- The link reuses the `?channel=` entry point that global search already
  uses (FEAT-01). The feed applies it once, then tidies the address back to
  `/`, so no new feed code was needed.
- To carry a link, the message is now any React content (`ReactNode`)
  rather than plain text. The Channels screen's toast state and
  `AddChannelBar`'s `onMessage` changed type; every other message is still
  a string, which is valid content.

**Key code**
`components/TopBar.tsx`:
```tsx
<span role="tooltip" className="… absolute left-[80px] top-[calc(100%-4px)] … px-2.5 pb-1 pt-0.5 shadow-sticker group-hover:block …">
  <span className="absolute -top-[6px] left-3 h-2.5 w-2.5 rotate-45 border-l border-t border-ink bg-surface" />
  {/* .pen-note is unlayered CSS, so a Tailwind size class wouldn't override it */}
  <span className="pen-note" style={{ fontSize: "1.125rem" }}>your feed, no algorithm</span>
</span>
```
`components/channels/AddChannelBar.tsx`:
```tsx
<Link href={`/?channel=${data.channel.id}`} className="whitespace-nowrap underline decoration-primary decoration-2 underline-offset-2 hover:decoration-ink">See its videos →</Link>
```

**Alternatives considered**
- *Always show the tagline in the pen under the logo* (no hover): it
  crowds the top bar, and the feed page already has a pen note beside its
  title.
- *Jump straight to the feed after adding*: you often add several channels
  in a row, so staying on Channels with a link lets you choose.
- *Rename "Add channel" to "Add / manage" or similar*: it would blur two
  places into one button; kept as is (owner agreed).

**Files** — `components/TopBar.tsx`, `components/channels/AddChannelBar.tsx`,
`components/channels/ChannelsClient.tsx` (toast holds `ReactNode`).

**Verified**
- At 1440px, hovering the logo shows the blue handwritten tagline under
  the word, with the pointer lined up. Measured: the bubble spans x 104–266
  and the sidebar's "Your feed" heading ends at x 97, so they no longer
  overlap. (The first version sat at the far left at 23px and covered the
  heading; the owner asked for it smaller, with a comma, moved right.)
- `/?channel=298` opens "Everything · from Haunting Tube" with that channel
  ticked in the sidebar.
- Typecheck, lint and build pass.
- The link inside the "Added…" message itself needs a real channel add,
  which spends YouTube quota, so the owner will check it on his next add.

#### REF-10 · Channel name as a genre-coloured tag on cards — ✅ done · 2026-10-17
**The problem**
- Phase 9 cut the genre colour on cards down to an 8px dot beside a dark
  channel name. It's calm, but the colour barely registers.
- Before the redesign, the channel name was a filled tag in its genre
  colour, and the owner missed that look.

**The change**
- On feed and Shorts cards, the channel name is a small tag filled with its
  genre colour: 4px corners, no border, semibold text.
- The text is ink on light colours and white on dark ones (orange-red,
  indigo).
- A channel with no genre gets a plain grey tag. The fallback used to be
  yellow, which as a filled tag would look like a button.
- The dot is gone from cards. The sidebar, Notebook and Tracks keep their
  dots, because there a dot sits next to the genre's name.

**How it works**
- The card already received `genreColor`; it now paints the tag's
  background with it.
- `textColorFor()` in `lib/color.ts` picks the text colour. It compares the
  WCAG contrast of ink and of white against that background and keeps the
  higher. The pre-redesign tag used the same helper.
- A non-hex value such as the grey `var(--color-line)` keeps ink.
- `min-w-0 truncate` lets a long name end in "…" on narrow Shorts cards, so
  the age stays visible.

**Key code** — `components/feed/VideoCard.tsx`
```tsx
<span
  className="min-w-0 truncate rounded-xs px-1.5 py-px font-semibold"
  style={{ backgroundColor: genreColor, color: textColorFor(genreColor) }}
  title={video.channelTitle}
>
  {video.channelTitle}
</span>
```

**Alternatives considered**
Each option was mocked on the real feed cards, with screenshots, before
choosing:
- *A, keep the dot*: the calmest, and my recommendation; the owner
  preferred more colour.
- *C, the name in the genre colour*: yellow, lime and sky text is nearly
  invisible on cream.
- *D, the name in a darkened genre colour*: readable but muddy (yellow
  turns olive), and no longer the same colour as the sidebar dots.
- *The old tag exactly* (1px ink border): heavier than the v2 calm base,
  where borders are reserved for controls.
- *A pale tint behind dark text*: a quieter middle ground; offered, not
  chosen.

**Files**
- `components/feed/VideoCard.tsx`: the tag, plus the `textColorFor` import.
- `components/feed/FeedClient.tsx`: no-genre fallback `var(--color-primary)`
  → `var(--color-line)`.

**Verified**
- Dev server at 1440px and at the pane's own width.
- Videos: Haunting Tube (Horror, orange-red) shows white text; CodeSnippet
  and GenZ Career (Interview, yellow) and ByteMonk (Tech, blue) show ink.
- Shorts: 24 tags render; long names ("Vishakha Sadh…") cut off with the
  age still showing.
- Typecheck and lint pass.

#### REF-11 · Notebook search highlights the words it found — ✅ done · 2026-10-21

**The problem (owner, in use).** Searching the Notebook ("hash map") finds
the right answers and gives each matching answer a yellow bar on its left,
but inside a long answer you still had to hunt for where the words were.

**The change.** The searched words get the soft yellow highlighter, the same
mark global search (⌘K) already uses, in the video title, each answer's
question line, the answer itself (inside lists, bold text, headings) and
your own note. Clearing the search clears the marks.

**How it works.**
- `components/ui/highlight.tsx` already had `highlight(text, term)` for ⌘K.
  It is unchanged, apart from its class now coming from a shared
  `MARK_CLASS` constant (same value). The reader uses it for the title,
  the question lines and the note.
- Answers are markdown, so plain text splitting can't reach inside them. A
  small `rehypeHighlight(term)` plugin in the same file walks the HTML tree
  react-markdown builds and wraps matches in `<mark>`; `Markdown` takes an
  optional `highlight` prop and styles `mark` with `MARK_CLASS`. It works
  after parsing, so it never touches markdown syntax and adds no package.
- `NotebookClient` passes the search (`highlight={query}`); the question
  filter alone doesn't highlight, since it matches whole questions.
- Matching is the search's own: case-insensitive, plain text. A match split
  by formatting ("hash **map**") isn't marked, though the answer is still
  found.

**Key code.**
```tsx
<ReactMarkdown components={components} rehypePlugins={highlight ? [[rehypeHighlight, highlight]] : []}>
```

**Alternatives considered.** *An underline* (the owner's first idea, like
FIX-07's): links in answers already have a yellow underline, so a match and
a link would look the same; a highlighter background is unmistakable and is
already the app's search mark. *A markdown-highlighting package*: a 40-line
plugin does it with nothing new to install. *Next up, separately (owner's
order):* (A) open the video at its first match; (B) let "hash map" also find
"HashMap" by ignoring spaces and hyphens when matching.

**Files.** `components/ui/highlight.tsx`, `components/Markdown.tsx`,
`components/notebook/NotebookReader.tsx`,
`components/notebook/NotebookClient.tsx`.

**Verified** (local, real notebook, read-only). "hash map": "Hash Map"
marked inside a list item. "interview": 1 mark in the title, 1 in the
question line, 5 in the answer. Empty search: no marks. The mark is
`bg-primary/45`, identical to ⌘K's. No server errors; typecheck and lint
pass. Not checked visually: an own note, as the local database has none
(same `highlight()` call as the title).

#### REF-12 · Notebook search opens at the first match — ✅ done · 2026-10-21

**The problem.** With REF-11 the found words are highlighted, but a match
can sit far down a long answer (one was 1,615 px below the top), so you
still scrolled to find it. Item A of the owner's step-by-step list.

**The change.** While searching, the reader jumps to the first highlighted
word (outside the title, which is already at the top) and puts it in the
middle of the screen: when you open a video from the list, and when you
change the search, after a 400 ms pause so it doesn't jump on every
keystroke. No search, no scrolling.

**How it works.** An effect in `NotebookReader` keyed on `highlight`. The
reader is keyed by video id, so opening a video mounts a fresh one and the
effect runs; typing changes `highlight` and the timer restarts. It finds the
first `<mark>` outside the `<header>` and calls `scrollIntoView({ block:
"center" })`.

**Key code.**
```tsx
useEffect(() => {
  if (!highlight) return;
  const timer = setTimeout(() => {
    const first = [...(articleRef.current?.querySelectorAll("mark") ?? [])].find(
      (m) => !m.closest("header")
    );
    first?.scrollIntoView({ block: "center" });
  }, 400);
  return () => clearTimeout(timer);
}, [highlight]);
```

**Alternatives considered.** *Smooth scrolling*: tried first. It's slow to
watch over 1,500+ px, and it never ran in the in-app test browser, so it
couldn't be verified; an instant jump is clear and testable. *"1 of 5" with
next/previous buttons*: more UI; possible later if one jump isn't enough.

**Files.** `components/notebook/NotebookReader.tsx`.

**Verified** (local, read-only). "hash map": jumped to the first match in
the answer (centred). Opening another listed video: jumped 1,615 px to its
match. Typing "h", "ha" quickly: no jump; after the pause: jumped. Clearing
the search: no scroll. Typecheck and lint pass.

#### REF-13 · Notebook search ignores spaces and hyphens ("hash map" finds "HashMap") — ✅ done · 2026-10-21

**The problem.** Notebook search compared text exactly (ignoring case), so
"hash map" missed notes that say "HashMap", "hashmap" or "hash-map", and
"concurrent hash map" found nothing at all, since the notes write
"ConcurrentHashMap". Item B of the owner's step-by-step list.

**The change.** Spaces, hyphens and underscores between letters no longer
matter, in the query or in the notes. "hash map", "hashmap" and "HashMap"
all find each other, and the highlighter (REF-11) marks whichever spelling
was found. "HashSet" and "hashing map" still don't match.

**How it works.** `loosePattern(term)` in `components/ui/highlight.tsx`
drops separators from the query and joins its characters with
`[\s\-_]*`, case-insensitive; every character is regex-escaped, so "c++"
or "a.b" are safe. `looseMatcher()` (a non-global regex, so `test()` has no
leftover state) does the Notebook's filtering; `highlightLoose()` and
`rehypeHighlight()` use the same pattern for the marks, so what is found is
exactly what is highlighted. ⌘K's `highlight()` is unchanged (global search
is still exact; it runs on the server).

**Key code.**
```ts
export function loosePattern(term: string, flags = "gi"): RegExp | null {
  const chars = [...term.toLowerCase().replace(/[\s\-_]+/g, "")];
  if (chars.length === 0) return null;
  const escaped = chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("[\\s\\-_]*"), flags);
}
```

**Alternatives considered.** *Fuzzy (typo-tolerant) matching*: finds more,
but also junk (the reason the stricter feed search was dropped); this only
forgives how words are joined. *Removing separators from both sides and
comparing*: simple for filtering, but then the highlight can't map back to
the original text; the regex does both.

**Files.** `components/ui/highlight.tsx`,
`components/notebook/NotebookClient.tsx`,
`components/notebook/NotebookReader.tsx`.

**Verified.** Unit check: the three spellings match "HashMap", "hash map",
"hash-map", "hash_map", "hashmap", "ConcurrentHashMap" and "Hash   Map", not
"HashSet" or "hashing map"; "c++" and "a.b" match literally; an all-spaces
query doesn't filter. In the app (real notebook, read-only): "hash map" 3 →
10 videos, "hashmap" 8 → 10, "concurrent hash map" 0 → 5, with
"ConcurrentHashMap" highlighted. Typecheck and lint pass.

#### REF-14 · A bigger player that keeps the chapters (Expand, Full screen) — ✅ done · 2026-10-22

**The problem (owner, in use).** On a podcast the player card is a fixed
size. YouTube's own full-screen button only enlarges YouTube's video (the
iframe), so the chapter strip under it disappears.

**Also asked: are we allowed to play YouTube this way? Yes.** The player is
YouTube's own embedded player (the official IFrame Player API, from
youtube-nocookie.com) with its controls, branding and ads. What YouTube
forbids is taking the video stream into another player or hiding its
branding; the chapter strip sits outside the player and only calls the
API's own `seekTo` / `playVideo`.

**The change.** Two buttons in the player's header, before the ✕, for every
video except Shorts (they're vertical):
- **Expand** (arrows out): the card fills the browser window (8 px margin),
  the video takes all the height it can, the chapter strip stays under it.
  The button becomes **Shrink**; the first Esc shrinks, the next closes. The
  choice is remembered for the next video (localStorage,
  `tubebox:player-expanded`, a per-browser convenience).
- **Full screen** (corners out): the **whole card** (video and chapters)
  goes full screen through the browser's Fullscreen API on our own element;
  Esc leaves it (the browser's own key).
Feed videos get the bigger player but no chapter strip (owner's choice:
chapters stay a Podcasts feature).

**How it works.** `PlayerModal` keeps `expanded` and `fullscreen` (the
latter from `fullscreenchange`, true only when our card is the full-screen
element). When big, the card is `flex h-full w-full flex-col` and the video
box `min-h-0 flex-1` instead of `aspect-video`, so YouTube letterboxes inside
it. New icons from the same Phosphor 2.1.1 set: `expand`, `shrink`,
`fullscreen`, `exitFullscreen`.

**Files.** `components/PlayerModal.tsx`, `components/ui/iconPaths.ts`.

**Verified** (local, 1400×900). Expand: card 896×631 → 1384×884, video
1349×737, chapter strip visible with the current chapter highlighted;
remembered ("1"); Esc shrank it, a second Esc closed the player.
**Not verified here:** Full screen. The in-app test browser refuses full
screen (`document.fullscreenElement` stayed null after a real click); it's
the standard API, for the owner to try in Chrome. The test episode's resume
point was reset afterwards.

### FEAT — new features

#### FEAT-01 · Global search — ✅ done · 2026-10-17
**The problem**
Each page could only search itself: the feed searched titles in the view
you were on, the Notebook searched answers, the Channels page searched
names. To find "that Kafka answer" or "the channel with 'decode' in it" you
had to know which page to go to first.

**The change**
A **search box in the top bar** on every page ("Search everything", with a
⌘K hint). Typing shows a panel of results in three groups, **Channels ·
Videos · Answers & notes**, with scope tabs and counts ("All 25 · Channels
0 · Videos 17 · Answers & notes 8"):
- **Channels**: photo, name, @handle, video count.
- **Videos**: thumbnail, title, channel, age and length; "Seen" on ones
  you've watched, so search doubles as "where was that video".
- **Answers & notes**: GEMINI or NOTE tag, **the line that matched** (not
  just the video title), and the question and video it belongs to.
- Matching words are highlighted. Starting with **`@`** searches channels
  only.
- **Where results go:** a channel opens the feed showing just that channel
  (all of it, on Everything); a video opens the feed with its **study
  panel** open; an answer or note opens it in the **Notebook**; "Show
  'kafka' in the feed →" opens the feed with that search filled in.
- **Keys:** ⌘K / Ctrl+K jumps to the box from anywhere; ↑↓ move, Enter
  opens, Tab changes scope, Esc closes. Clicking the dimmed page closes it.
- On a phone the box gets its own row in the top bar, and results open just
  under it.

**How it works**
*One request, three questions.* The server runs the channel, video and
answer/note searches at the same moment and sends one answer with the top
results of each and their totals (about 140 ms locally). Videos use the
same matching the feed's search box uses: the words appear in the title,
*or* the title is close (typo-tolerant, Postgres's trigram similarity), so
"kubernets" still finds Kubernetes. Titles that really contain the words
come first, then the newest. Answers and notes are matched by containment,
and the server cuts out the text around the first match so you see *why*
it matched.

*Search is a door, not a page.* Results don't get their own screen; each
one opens the place that already shows that thing best. To do that the
feed now accepts three address hints: `/?channel=5`, `/?video=42`,
`/?q=kafka`. It applies them, then tidies the address back to `/`, so a
reload doesn't re-apply an old search over what you've done since. The
Notebook's `?v=` address (Phase 5) was built for exactly this. Opening a
video needs its details even if it isn't loaded in the feed, so there's a
small new "one video" read (`GET /api/videos/:id`).

*Typing doesn't flood the server.* It waits for a 200 ms pause, and only
the newest answer is shown, the same "ticket" trick as the feed (REF-04).
A `%` or `_` you type is searched literally, not treated as a wildcard.

**Key code** — `lib/search.ts` and `components/FeedClient.tsx`
```ts
// lib/search.ts: all groups in one round trip.
const [channelRows, videoRows, [videoCount], answerRows, [answerCount], noteRows, [noteCount]] =
  await Promise.all([channelQuery, videoQuery, videoTotal, answerQuery, answerTotal, noteQuery, noteTotal]);

// FeedClient: a search link lands here, is applied, and the address is tidied.
if (channel) { setChannelIds([channel]); setView("all"); }
router.replace("/", { scroll: false });
```

**Alternatives considered**
- *A search results page*: one more screen to design and keep in step; the
  feed, the study panel and the Notebook already display each kind of
  result well.
- *A full-text search index* (Postgres `tsvector`, or an external service):
  better ranking at large scale, but a new column, index and sync to
  maintain. At personal scale ILIKE plus trigram answers in ~140 ms.
- *Search everything in the browser*: would mean downloading every answer
  and title up front.
- *A number on "See all"*: removed after testing. Search counts videos and
  shorts together, but the feed shows one kind at a time, so "See all 17"
  landed on 9.

**Files** — `lib/search.ts`, `app/api/search/route.ts`,
`components/GlobalSearch.tsx` (all new); `components/TopBar.tsx` (the box),
`components/FeedClient.tsx` (address hints), `app/api/videos/[id]/route.ts`
(`GET` one video)

**Verified** — "kafka": 17 videos, 8 answers with the matching lines, 12
highlights, first row active; ↓, Tab (scope → Videos) and Enter opened the
second video in its study panel, address back to `/`. From the Notebook,
"@code" listed 5 channels only, and Enter opened the feed on "23 videos from
Code Decode". An answer opened `/notebook?v=1522`; "Show 'kafka' in the
feed" filled the feed's search. "50%" searched literally; "kubernets" found
Kubernetes. On a phone the panel opens under the box (190 → 196 px), no
sideways scroll. No console errors in a fresh tab; build passes.

#### FEAT-02 · Sidebar and nav counts — ✅ done · nav 2026-10-16 · sidebar 2026-10-16
**The problem**
You couldn't tell how much was waiting anywhere without opening it.

**The change**
Counts next to the nav tabs (Phase 2): **Feed** = everything unwatched (videos
and shorts), **Notebook** = saved answers plus personal notes, **Tracks** =
number of tracks. Channels has none.

Counts in the feed sidebar (Phase 3): every view and every genre. The rule
for all of them: **the number is what you'd see if you clicked that row,
keeping your other choices.** On Shorts with "kafka" typed, Inbox shows the
unseen kafka shorts, and each genre shows its share of that. Channel counts
are the one exception: they stay each channel's whole archive of the current
kind, as before, so they don't jump around while you browse.

**How it works**
*Getting the nav numbers.* One endpoint, `/api/nav`, returns all three counts
plus the last sync time. Its four small database questions are sent at the
same moment rather than one after another, so on Neon (where each question
is a ~250ms round trip) the bar costs one wait, not four.

*Getting the sidebar numbers.* They arrive with the first page of the feed,
in the same request, so they cost no extra round trip. The server builds the
feed's filter as separate pieces (type, view, genre, channels, search,
length). For the view counts it leaves out only the *view* piece and counts
all four views in one pass, using Postgres's `FILTER`: one trip through the
table with four tally marks, not four trips. For the genre counts it leaves
out *genre and channel* and groups by genre. "Load more" skips all of this.

*Keeping them fresh.* When you mark a video watched, save a note, get an Ask
answer or create a track, the number in the bar should change. The card that
did it doesn't know the bar exists, and shouldn't. Instead it rings a bell:
it fires a browser event called `tubebox:nav-changed`. The bar listens for
that bell and recounts. Like a doorbell, the person ringing doesn't need to
know who's home. The bar waits a moment before recounting, so ticking off five
videos in a row costs one recount, not five. The sidebar is adjusted on the
spot instead (Inbox −1, History +1, that genre −1), since the feed already
knows exactly what changed.

**Key code** — `app/api/videos/route.ts` and `lib/nav-events.ts`
```ts
// All four view counts in one pass: the filter minus its "view" piece.
db.select({
  unwatched: sql`count(*) FILTER (WHERE watched = false)`,
  watched:   sql`count(*) FILTER (WHERE watched = true)`,
  later:     sql`count(*) FILTER (WHERE later_at IS NOT NULL)`,
  all:       sql`count(*)`,
}).where(and(...kindC, ...genreC, ...channelC, ...searchC, ...lengthC));

// lib/nav-events.ts: any component can say "counts may have changed".
export function notifyNavChanged() {
  window.dispatchEvent(new Event("tubebox:nav-changed"));
}
```
The bell is rung from: `FeedClient` (watched toggle, auto-watched at 50%,
bulk add), `StudyPanel` (answer saved), `NoteEditor` (note saved),
`TrackMenu` and `TracksClient` (track changes, end of a viewing session),
`ManageClient` (channel added or removed).

**Alternatives considered**
- *Pass a "recount" function down from the page to every card*: works, but it
  threads through several layers of components that don't otherwise care.
- *A shared state library or React context*: more machinery than a few
  numbers need.
- *Recount on a timer*: the numbers would lag, and the database would be
  queried every few seconds for nothing.
- *Sidebar counts from a separate endpoint*: one more round trip on every
  filter click, for numbers that only matter alongside the page.

**Files** — `lib/nav.ts`, `app/api/nav/route.ts`, `lib/nav-events.ts`
(Phase 2); `app/api/videos/route.ts` (`facets`), `components/FeedSidebar.tsx`,
`components/FeedClient.tsx` (`bumpFacets`) (Phase 3)

**Verified** — nav: Feed 1275 → 1355 after a sync, Notebook 28, Tracks 1.
Sidebar: marking a video seen moved Feed 1355 → 1354, Inbox 2 → 1, History
0 → 1 and the genre total 8 → 7 at once; Undo put every number back.

#### FEAT-03 · Seen with Undo — ✅ done · 2026-10-16
**The problem**
A misclick on "seen" could send a video somewhere you'd have to go and find.

**The change**
Ticking ✓ dims the card in place and shows **Seen · ↶ Undo** on the
thumbnail. Undo (or ticking ✓ again) brings it straight back. The card leaves
Inbox the next time the feed loads. On History, where everything is seen,
cards aren't dimmed.

**How it works**
Ticking saves straight away, as before. The card simply isn't removed from
the screen; it changes how it looks. Undo is the same toggle in reverse, so
there's no "pending" state to lose if you navigate away.

**Key code** — `components/VideoCard.tsx`
```tsx
const dimmed = video.watched && dimSeen;   // dimSeen is false on History
{dimmed && <div>Seen <button onClick={() => onToggleWatched(video)}>Undo</button></div>}
```

**Alternatives considered**
- *Wait a few seconds before saving, with a countdown*: if the tab closes in
  that window the tick is lost, and the counts would be briefly wrong.

**Files** — `components/VideoCard.tsx`, `components/FeedClient.tsx`

**Verified** — tick then Undo on "Most Asked Kafka Scenario…": dimmed with
Seen · Undo, then restored, and the database matched each step.

#### FEAT-04 · Play unseen in a row — ✅ done · 2026-10-17
**The problem**
Watching shorts meant open one, close, open the next, close: dozens of
clicks for something meant to be quick.

**The change**
**▶ Play unseen in a row** on Shorts plays the unseen shorts on screen one
after another, newest first, in the portrait player. The player shows
**"SHORT 2 OF 921 UNSEEN"** and a **Next ›** button.
- A short that **plays to the end** is marked seen, and the next one starts.
- **Next** skips without marking it seen, since skipping isn't watching. If
  YouTube's player can't load and the simple fallback player is used
  (which can't report "ended"), Next is how you move on.
- When the loaded shorts run out, the next page is fetched and the line
  carries on; at the very end you get "That's every unseen short here."
- Closing the player stops the run.

**How it works**
*A line of shorts, and a finger on the current one.* Pressing the button
takes the unseen shorts already on screen as a list, and the player shows
the one at the current position. When the player reports "ended" (the same
signal track autoplay uses), that short gets the normal ✓ (so counts,
Seen · Undo and the top bar all update as if you'd ticked it), and the
finger moves one along. Next moves it along without the ✓.

*Running past the loaded page.* The feed shows 24 shorts at a time. When the
finger reaches the end and the server said there's more, the page loader
fetches the next 24 (the same "Load more" the button at the bottom uses),
which now also *hands back* what it loaded, so the line can grow with the
unseen ones. The "of 921" comes from the sidebar's Inbox count for shorts
with your current filters, so it matches what you see.

*A fresh player per short.* Each short gets its own player (React's `key`),
so its resume point and timers start clean rather than carrying over from
the previous one.

**Key code** — `components/FeedClient.tsx`
```ts
async function queueEnded() {          // a short played to the end
  if (current && !current.watched) await toggleWatched(current);   // the normal ✓
  await advanceQueue();                // next one; loads another page if needed
}
```
`components/PlayerModal.tsx` takes an optional `queue` (label + onNext) for
the header.

**Alternatives considered**
- *Mark each short seen when it starts*: a short you skip after two seconds
  would vanish from the inbox. The honest rule is to count it when it's
  watched.
- *Fetch every unseen short up front*: up to hundreds of rows before the
  first one plays. Growing the line a page at a time starts instantly.
- *Use YouTube's own playlist player*: it brings YouTube's suggestions and
  autoplay rules back in, exactly what TUBEBOX avoids, and loses honest
  progress tracking.

**Files** — `components/FeedClient.tsx` (`playUnseen`, `advanceQueue`,
`queueEnded`; `loadPage` returns what it loaded), `components/PlayerModal.tsx`
(`queue` prop)

**Verified** — Play unseen opened "SHORT 1 OF 921 UNSEEN" ("COMPLETE AWS
Roadmap…"); Next moved to "SHORT 2 OF 921 UNSEEN" with the next short;
closing stopped the run; neither short was marked seen. *Not run live:* a
short playing to its end. It would mark a real short seen. That path is the
normal ✓ plus the same "next" step that Next uses, and the "ended" signal is
the one track autoplay already relies on.

#### FEAT-05 · Ask from the Notebook — ✅ done · 2026-10-17
**The problem**
Reviewing an answer in the Notebook and wanting to ask one more thing meant
going back to the feed, finding the video, and opening its panel.

**The change**
Under the answers in the reader: **"Ask a follow-up about this video"**. The
new answer appears in place, at the end, and the list's counts and the top
bar's Notebook count update.

**How it works**
It's the same Ask as in the feed's study panel: the same endpoint, the same
saved answers, the same cost. A question you've asked before comes back as
the saved answer without calling Gemini, and isn't listed twice. While it
works, a dashed card shows your question with "Thinking…".

**Key code** — `components/NotebookClient.tsx` → `Reader.ask()`
```ts
const res = await fetch(`/api/videos/${video.id}/ask`, { method: "POST", body: JSON.stringify({ prompt }) });
onAnswer(data.note);   // replaces a same-id answer, so a repeat isn't shown twice
notifyNavChanged();    // the top bar's Notebook count
```

**Alternatives considered**
- *Open the feed's study panel from the Notebook*: one shared panel, but the
  reader already shows the answers at full width; a second panel on top
  would duplicate them in a narrower column.
- *Suggestion buttons here too* (genre + everyday, as in the panel): left out
  to keep the reader calm. You come here to review, and a typed follow-up is
  the usual move. Easy to add if wanted.

**Files** — `components/NotebookClient.tsx`

**Verified** — re-asking "List all the questions asked in this video" on a
video that already had it returned the saved answer (`cached: true`, no
Gemini call); the answer count stayed 1 and the box cleared.

#### FEAT-06 · Track "last watched" — ✅ done · 2026-10-17
**The problem**
A track showed how much was left, but not when you last worked on it, so a
track you'd drifted away from looked the same as one you used yesterday.

**The change**
Each track in the list says **"last watched today / yesterday / 3d ago"**,
and the list is ordered by it, most recent first.

**How it works**
TUBEBOX knew *whether* a video was watched, never *when*. So videos get one
new column, **`last_played_at`**. While a video plays, the player already
saves progress every 15 seconds; that same save now also stamps the time.
No extra request, just one more field in an update that was happening
anyway. A track's "last watched" is the latest stamp among its videos.

Only real playing counts. Ticking ✓ by hand doesn't set it, because that
isn't watching. Videos played before this change have no stamp, so a track
shows "last watched" only from its first play after deploying.

**Key code** — `app/api/videos/[id]/route.ts`
```ts
// A progress save means it's being played right now — the tracks page's
// "last watched". Same UPDATE, so it costs nothing extra.
updates.lastPlayedAt = new Date();
```
`lib/schema.ts` adds the column and `lib/db.ts` creates it (`ALTER TABLE
videos ADD COLUMN IF NOT EXISTS last_played_at`), automatically on the next
start, like every earlier column.

**Alternatives considered**
- *Use `personal_note_at` or answer times as "activity"*: those are about
  studying, not watching, and are missing for tracks you only watch.
- *A watch-history table (one row per sitting)*: would allow "watched 3
  times this week", but nothing needs that yet. One column answers the
  question.
- *Count a hand-ticked ✓ as "watched now"*: the tick is often used to clear
  things you'll never watch, which would make the label lie.

**Files** — `lib/schema.ts`, `lib/db.ts`, `app/api/videos/[id]/route.ts`,
`lib/tracks.ts`, `components/TracksClient.tsx`

**Verified** — a progress save that marked no chunks played (so no watched
time was added) stamped the video; its test track then read "last watched
today" and moved to the top of the list; the "AI" track, never played since,
shows only "54m left".

#### FEAT-07 · Channel last upload and status — ✅ done · 2026-10-17
**The problem**
Nothing showed when a channel last posted, so channels that had gone quiet
sat in the list unnoticed.

**The change**
A **Last upload** column ("16h ago", "2mo ago") and a **Status**: *Active*,
*Paused*, or, in warning colour, *No uploads 4 mo* when a channel hasn't
posted for over 3 months (*No uploads stored* if none were ever fetched).
The **Quiet** filter and the "N quiet for 3+ months" link show just those.

**How it works**
No new storage. The server already has every video with its publish date,
so when it lists channels it asks the database, in one grouped pass over the
videos, for each channel's newest date along with its video and shorts
counts. Before, it asked only for the counts, so the extra date is free.
"Quiet" is decided in the browser: active and newest upload over 90 days
ago. A paused channel shows as Paused instead, since it isn't being checked
anyway.

**Key code** — `app/api/channels/route.ts`
```ts
// One grouped pass: counts of each kind plus the newest upload, per channel.
db.select({
  channelId: videos.channelId,
  videoCount: sql`count(*) FILTER (WHERE is_short = false)`,
  shortCount: sql`count(*) FILTER (WHERE is_short = true)`,
  lastUploadAt: max(videos.publishedAt),
}).from(videos).groupBy(videos.channelId);
```

**Alternatives considered**
- *Ask YouTube for each channel's latest upload*: exact even beyond the
  backfill window, but 100 extra API calls per page view.
- *Store a `last_upload_at` column, updated on every sync*: one more thing to
  keep in step; the grouped query is already fast at this size.

**Files** — `app/api/channels/route.ts`, `components/ChannelsClient.tsx`
(`statusOf`, `isQuiet`)

**Verified** — the column reads as expected (e.g. KodeKloud "7h ago",
Selenium Express "2mo ago"); sudoCODE, with nothing stored, shows "No uploads
stored" and is the one channel under Quiet; sorting by last upload puts the
newest first.

#### FEAT-08 · Bulk channel actions — ✅ done · 2026-10-17
**The problem**
Re-organising channels meant changing them one by one: a genre dropdown here,
a pause button there, a confirm pop-up for each delete.

**The change**
Tick channels (or the header box for everything shown) and a black bar
replaces the toolbar: **N selected · Move to genre… · Backfill… (Re-sync until FEAT-10) · Pause ·
Resume · Delete… · ✕**. Pause only shows when something ticked is active,
Resume when something is paused.

**How it works**
*Move, pause, resume and delete are one request.* The page sends the list of
ids and the action to `/api/channels/bulk`, which runs a single
`UPDATE … WHERE id IN (…)` or `DELETE … WHERE id IN (…)`. Twenty channels
cost one round trip, not twenty. The server cleans the list first (whole
numbers only, no repeats, at most 500) so a bad request can't do much.

*Re-sync is the exception.* Re-syncing asks YouTube for a channel's last
year of uploads, which can take several seconds, and Netlify stops any
request after 10 seconds. Doing twenty in one request would be cut off. So
the page sends one request per channel, in order, showing "Re-syncing 2 of 5 ·
KodeKloud" with a **Stop** button, and sums up at the end ("Re-synced 5
channels: recovered 12 missing videos. Failed: …"). One failing channel
doesn't stop the rest. Quota: each channel costs roughly 1–10 YouTube
units (one per 50 uploads looked at), a small slice of the 10,000 a day.

*Deleting is permanent and cascades*: a channel's videos go with it, and
with them their saved answers, notes and places in tracks (the database's
`ON DELETE CASCADE`). The confirm sentence says so, with the video count.

**Key code** — `app/api/channels/bulk/route.ts`
```ts
// One statement for any number of channels.
const where = inArray(channels.id, ids);
if (action === "pause" || action === "resume")
  await db.update(channels).set({ isActive: action === "resume" }).where(where);
else if (action === "delete") await db.delete(channels).where(where);
```

**Alternatives considered**
- *Loop over the existing one-channel endpoints from the page*: works, but N
  requests for what the database does in one statement, and a half-finished
  state if the tab closes midway.
- *Re-sync everything in one request*: cut off by Netlify's 10-second limit
  after a few channels.

**Files** — `app/api/channels/bulk/route.ts` (new), `components/ChannelsClient.tsx`

**Verified** — on two channels: Pause → both "Paused", Resume → both "Active";
Move to Finance → both moved (panel Finance 0 → 2), moved back; Delete…
confirm then Cancel. Re-sync from a row's ⋯ menu on Coding with Aman showed
"Re-syncing 1 of 1" and recovered 43 videos a past backfill had missed.

#### FEAT-09 · Everyday Ask suggestions — ✅ done · 2026-10-16
**The problem**
The only one-click question was the genre's (e.g. Interview's "List all the
questions asked in this video"). Questions you ask of almost any video had to
be typed each time.

**The change**
In the Ask tab, above the question box: the genre's suggestion first, then up
to three **everyday suggestions you choose**. They're edited on the Channels
page under "Everyday Ask suggestions" (beside the genres since Phase 4).
The list starts empty, so nothing changes until you add some; until then the
Ask tab shows a small "+ Add your everyday questions" link.

**How it works**
The list is stored in `app_meta`, the key/value table from Phase 2, under
`ask_suggestions`, so no new table was needed. Saving cleans it first: trims
spaces, drops blanks and repeats (ignoring capitals), keeps at most three.
A suggestion costs nothing until pressed; then it's a normal Ask, and asking
the same thing twice returns the saved answer for free.

**Key code** — `lib/askSuggestions.ts`
```ts
// Clean, cap at three, and save as one JSON row in app_meta.
const list = cleaned.slice(0, MAX_SUGGESTIONS);
await db.insert(appMeta).values({ key: "ask_suggestions", value: JSON.stringify(list) })
  .onConflictDoUpdate({ target: appMeta.key, set: { value: JSON.stringify(list) } });
```

**Alternatives considered**
- *Hard-code three suggestions*: config over code. Your questions aren't
  someone else's.
- *A suggestions table*: three short strings don't need one.

**Files** — `lib/askSuggestions.ts`, `app/api/ask-suggestions/route.ts`,
`components/AskSuggestionsEditor.tsx` (all new); `components/ManageClient.tsx`,
`components/StudyPanel.tsx`

**Verified** — saving "  Summarise as revision notes ", a repeat in other
capitals, a blank and four more kept exactly three clean entries; reset to
empty afterwards. The editor shows on the Channels page; Save stays off
until something changes.

#### FEAT-10 · Backfill 1Y–5Y replaces Re-sync (Phase 4.1) — ✅ done · 2026-10-17
**The problem**
Raised by the owner while testing Phase 4: sudoCODE showed no videos at all.
It was added with a 1-year backfill and hasn't posted for about a year, so
nothing fell inside the window. Re-sync didn't help: it always re-checked
the default 12 months, whatever window the channel was added with. The only
fix was to delete the channel and add it again with 3 years.

A second, hidden problem: a backfill gathered *all* the videos first and
saved them in one go at the end. On the live site Netlify stops any request
at 10 seconds, so a deep backfill of a busy channel could be cut off and
save nothing at all.

**The change**
- **"Re-sync" becomes "Backfill…"** with a window: 1Y · 2Y · 3Y · 4Y · 5Y,
  in each row's ⋯ menu and in the bulk bar. It means "make sure every upload
  from the last N years is here". Backfill 1Y is exactly the old Re-sync;
  3Y on sudoCODE reaches its older videos, with no delete and re-add.
- **A channel with nothing stored** shows "Try backfilling 3 years" under
  its status.
- **Backfills save as they go and carry on where they stopped**, so deep
  backfills work on the live site too. Adding a channel uses the same
  mechanism.

**How it works**
*Page by page.* YouTube hands a channel's uploads out 50 at a time, newest
first, each page ending with a bookmark (a "page token") for the next. The
backfill now stores each page (skip what's already there, fetch details,
check for shorts, insert) before reading the next one. If the request is
cut off, everything stored so far is kept.

*A time budget and a bookmark.* Each backfill request watches the clock.
After 6 seconds it stops starting new pages (a page takes up to ~2 s, so it
finishes well under Netlify's 10) and returns YouTube's bookmark as a
`cursor`. The page calls again with that cursor and the next request
carries on at exactly that spot. It's like a library book with a
bookmark: you read it in several sittings, never from page one again. The
progress shows as "Backfilling 3Y · 1 of 2 · KodeKloud · 120 found", with
Stop.

*The regular sync didn't change.* The scheduled sync and the refresh button
use the same code without a budget, reading up to 20 pages per channel as
before (in practice one or two for a 14-day lookback). The only difference
is it saves per page now.

**Key code** — `lib/ingest.ts` → `backfillChannel()`
```ts
for (let page = 0; ; page++) {
  // Out of time? Hand back the bookmark instead of starting another page.
  if (deadline != null && page > 0 && Date.now() > deadline) return { added, cursor };
  const { ids, next } = await listUploadsPage(playlistId, since, cursor);
  added += await storePage(db, channel.id, ids);   // saved before reading on
  if (!next) break;
  cursor = next;
}
```
The page side is `continueBackfill()` in `components/ChannelsClient.tsx`: call
`/api/channels/:id/backfill` with the cursor until it comes back empty.

**Alternatives considered**
- *Remember each channel's backfill window and have Re-sync reuse it*: still
  needs delete-and-re-add to go deeper, and adds a column to keep in step.
- *A separate "Fetch older videos" button next to Re-sync*: two words for
  nearly the same thing. One "Backfill N years" covers both.
- *Raise the server's time limit*: not possible on Netlify's free tier.
- *A background job queue*: the right tool for long jobs, but new
  infrastructure for something a bookmark solves.

**Files** — `lib/youtube.ts` (`listUploadsPage`), `lib/ingest.ts`
(`backfillChannel`, `storePage`, `BACKFILL_BUDGET_MS`),
`app/api/channels/[id]/backfill/route.ts` (new; replaces `/resync`),
`app/api/channels/route.ts` (add uses the budget), `components/ChannelsClient.tsx`

**Verified**
- *Carry-on loop:* with the budget temporarily set to 0 (one page per
  request), a 1-year backfill of KodeKloud took 12 chained requests, each
  continuing from the last. It found 164 missing videos. Afterwards
  KodeKloud had 556, all from the last year, no duplicates, none from other
  channels. The likely cause: the app originally backfilled 6 months, so
  channels added then never had their older half-year. Budget restored to
  6 s.
- *The owner's case:* sudoCODE went from "No uploads stored" to 8 videos + 2
  shorts via "Try backfilling 3 years".
- *Regular sync unchanged:* the refresh checked 13 channels, 200 OK, no
  errors.
- Build, typecheck and lint pass.
- *Not tested live:* adding a new channel whose first backfill needs more
  than one request (it would add a real channel). It shares the carry-on
  code tested above.

#### FEAT-11 · Greeting — ⏸ parked · 2026-10-17
**The problem**
The feed opens straight onto a list; there's no sense that it's *your* app.

**The change (if picked up)**
"Good morning, Chandan." above the inbox, with a line saying what's new
("4 new videos since yesterday, from …"). Morning/afternoon/evening comes
from the browser's clock. "New" would mean published in the last 24 hours,
which the stored `publishedAt` already gives; "new since your last visit"
would need new tracking. The name needs a home (an env variable, or a
setting on the Channels page). Not the swoosh under the name: that copied
Dan's dashboard too literally.

**Why parked** — it needs stored data (the name), and the owner wasn't sure
it's worth it. The pen notes (REF-07) carry the personality for now.

#### FEAT-12 · Pick up where you left off — ⏸ parked · 2026-10-17
**The problem**
Half-watched videos and a track's next step are only visible if you go
looking (a thin progress bar on a card, or the Tracks page).

**The change (if picked up)**
A row of up to three tiles above the inbox: half-watched videos with the
time left ("22 min left of 35") and a "Resume" play button, plus the next
step of your most recent track ("Up next: step 4 of 9"). It's our version of
the "Needs you today" list on Dan's dashboard. **No new tracking needed:**
`watch_progress`, `resume_seconds`, `last_played_at` (FEAT-06) and the tracks
tables already hold it all; it needs one query and the row. Tried in the
preview (2026-10-17), then taken out.

**Why parked** — it's a new feature, not a look change; Phase 9 stays about
the look.

---

#### FEAT-13 · Offline: changes wait and save when you're back — ✅ done · 2026-10-19

**The problem.** After FIX-04 (A1), a ✓ Seen or bookmark made while the
connection was down was undone with an error, so you had to redo it later.
Popular apps keep the change and save it when the connection returns.

**The change.** When the connection drops, a bar at the bottom of every page
says "You're offline. Your changes will save when you're back online." ✓
Seen and bookmark changes stay on screen and wait ("2 waiting"). When the
connection is back they save by themselves, and the bar says "Back online.
All changes saved." The waiting list survives a reload ("Your earlier
changes were saved."). A save the *server refuses* (logged out, server
error) still undoes, with "Couldn't save. Please try again.": waiting won't
fix that. Ask, Summary and other live requests say "You're offline. This
needs a connection.", and Ask keeps your question in the box. Notes already
retried; offline, their label now says the note will save when you're back.
UI copy avoids em dashes, at the owner's request.

**How it works.** `lib/offline.ts` keeps the waiting list in localStorage
(`tubebox:pending-saves`). It keeps one entry per video and field (last
value wins, so three toggles make one save) and sends them oldest first,
stopping at the first network failure. `components/OfflineBar.tsx`, mounted
in the root layout, listens to the browser's `online`/`offline` events,
sends the list when back online (and on page open, then tells the feed to
reload), and retries every 15 s if a save failed while the browser still
said "online". `useFeedData`'s `saveVideo` returns saved / queued (offline,
or the request never reached the server) / refused. `api()` turns a request
that never left into a plain-words error.

**Alternatives considered.** *A service worker / full offline app* (open
TUBEBOX with no connection): far bigger, and the app needs the server for
everything it shows. *Queueing tracks, genres and channel edits:* ordering
and positions make them harder; left for later. *Retrying refused saves:*
pointless, since the answer won't change by waiting.

**Files.** `lib/offline.ts`, `components/OfflineBar.tsx`, `app/layout.tsx`,
`components/feed/useFeedData.ts`, `lib/api-client.ts`,
`components/NoteEditor.tsx`, and `components/TopBar.tsx` (em dashes removed
from the sync messages).

**Verified** (local; offline simulated via `navigator.onLine`, events and
failing requests). Offline bar shown. ✓ Seen and a bookmark stayed on screen
with "2 waiting", and back online both saved ("Back online. All changes
saved."; server confirmed; list emptied). Three toggles made one waiting save
with the final value. A reload with items waiting saved them on page open.
A server-refused save was undone with the toast and not queued. Ask offline
showed the message, kept the question, and made no Gemini call. Test changes
were undone; typecheck and lint pass.

#### FEAT-14 · Podcasts: their own section, with chapters — ✅ v1 built · 2026-10-21

**The idea (owner).** Long-form podcasts (e.g. MKBHD's Waveform) in their
own section, never mixed into the normal feed, Shorts included. Parked on
2026-10-19; designed with the owner on 2026-10-21.

**Decisions (owner, 2026-10-21).**
- **Ask and Summary stay** on podcasts. Worry was cost; the numbers say it's
  fine: the free tier counts calls, not length. A 2-hour episode is roughly
  25k tokens of transcript, one call per Ask, inside the 250k tokens per
  minute and well inside Netlify's 30 s. The transcript is fetched once
  (Apify, ~$0.005) and saved, so later Asks skip it. Nothing runs on its own.
- **No Transcript tab** on podcasts. **Add to track** stays (same tracks).
- **No genres in v1.** Podcasts jump between topics and there are few
  podcast channels, so the channel list is the filter. Their own genre set
  later if missed.
- **Podcast Shorts** live only in Podcasts (its own Videos / Shorts switch).
- **Continue listening** (episodes started but not finished, with their
  progress and "resume at 47:12") in v1: watch progress already exists.
- **Chapters**, with a jump to any of them (below).

**v1: the section.**
- Each channel gets a home: `channels.section` = `feed` (default) or
  `podcasts`. The add-channel box asks which; the Channels page can move a
  channel. Same 6-hourly sync, no extra YouTube quota.
- A **Podcasts** tab in the top bar with its count, beside Feed. The page
  reuses the Feed screen (Inbox / Watch later / Watched, Videos / Shorts,
  cards, study panel) with every query scoped to podcast channels; the Feed
  is scoped to feed channels. Nav counts, ⌘K and the Notebook keep working
  across both (the Notebook is about answers, wherever the video lives).
- **Continue listening**: a row at the top of Podcasts, episodes with
  progress between ~2% and ~95%, newest listened first, each opening the
  player at its resume point.

**v1: chapters from YouTube.** Most podcasts list chapters in the video
description ("0:00 Intro", "5:10 Early career"…). The sync already fetches
each video's `snippet`, which includes the description; it would start
saving the chapters it finds (parsed with YouTube's own rule: the first at
0:00, at least three, in order). Older videos: fetched once when the episode
is opened (videos.list, 1 quota unit). Saved on the video as `chapters`
(jsonb `[{start, title}]`) with `chapters_source` = `youtube`.

**v2: our own chapters, when the video has none.** A "**Make chapters ✦**"
action on the episode (one Gemini call, saved forever, like a summary).
- **The catch, solved:** saved transcripts are plain text with no times.
  The Apify Actor's own docs show its normal output **includes timestamps**
  (we turned them off with `include_transcript_text`), so this fetches the
  timed version once (~$0.005), groups it into ~30-second blocks
  ("[12:30] …"), and sends that.
- Gemini returns `[{start, title}]` as JSON. Checked before saving: starts
  must be real block times, in order, at least ~2 minutes apart, the first
  at 0:00, within the episode's length. `chapters_source` = `gemini`, shown
  with the sparkle so you know they're Gemini's, not the creator's.
- **Quality:** chapter titles are well within Flash-Lite's reach; the hard
  part is where each chapter starts. Plan: test on a podcast that already
  has YouTube chapters, make Gemini's own for it, and compare. If
  Flash-Lite's boundaries drift, use `gemini-3.8-flash` for this one job:
  it's made once per episode, so its 20 a day is plenty.
- A 2-hour episode with timestamps is ~35k tokens: one call.

**Jumping between chapters (owner: "not just a list").**
- In the study panel: a **Chapters** list (time + title). Clicking one
  **opens the player at that second**.
- In the player: a chapter strip under the video, the **current chapter
  highlighted** as it plays, and **previous / next chapter** buttons. The
  player already seeks (it's how Resume works) with the YouTube IFrame API's
  `seekTo`.

**Data (planned).** `channels.section` (text, default `feed`); on `videos`:
`description` (text, new videos), `chapters` (jsonb), `chapters_source`
(text). All added through `lib/db.ts`'s list, so PERF-05's stamp runs them
once on the first cold start.

**Costs.** Section, page, Shorts, Continue listening: none (same sync and
queries). YouTube chapters: none for new videos; 1 quota unit per older
episode opened. Gemini chapters: one Gemini call + one Apify run per
episode, only when asked.

**Open questions.** Should "Make chapters" happen by itself the first time
you open an episode without chapters, or only on a button? (Button keeps
every call deliberate.) Which channels move to Podcasts first?

**Owner's answers.** "Make chapters ✦" is a **button** (never automatic):
every Gemini call stays deliberate. First podcast channel: Waveform (the
owner added "WVFRM Podcast", @waveform, with the new form: 62 episodes,
30 Shorts).

**v1 as built (2026-10-21).**
- `channels.section` (`feed` | `podcasts`, default `feed`); `videos.chapters`
  (jsonb, null = never looked) and `videos.chapters_source`. No
  `description` column after all: the sync reads the chapters straight out
  of the description it already fetches (`lib/chapters.ts`,
  `parseChapters`: first at 0:00, at least three, in order, 10 s apart,
  inside the episode) and stores only them.
- `/api/videos` scopes every query (list, totals, sidebar facets, Watch
  later counts, `ids=1`) to `section` (default `feed`), and `continue=1`
  lists unwatched episodes with `resume_seconds` > 60, most recently played
  first (4). `/api/nav` counts unwatched per section (`inbox` = feed,
  `podcasts`) and `podcastChannels`; the top bar shows the **Podcasts** tab
  once a channel lives there.
- `app/podcasts/page.tsx` renders `FeedClient section="podcasts"`: title
  "Podcasts", pen note "long listens, at your pace", sidebar "Your podcasts"
  with no genres, its own Videos / Shorts ("Podcast shorts"), **Continue
  listening** above "New episodes", empty state pointing to Channels.
- Study panel and cards: **Chapters** replaces Transcript for podcast
  videos (Ask, Summary, Chapters, Note). `GET /api/videos/[id]/chapters`
  returns stored chapters, or looks an older video up once (1 quota unit)
  and stores the answer, even "none".
- Player: `startAt` (a chapter's second, which wins over the resume point)
  and, for podcasts, a **chapter strip** under the video: the chapter
  playing is highlighted (from the 1 s progress tick), any chip jumps
  (`seekTo` + `playVideo`), previous / next buttons.
- Channels page: "Move to Podcasts" / "Move to the Feed" in each row's
  menu, "· Podcasts" after the handle, and a Feed / Podcasts choice next to
  the genre when adding a channel. ⌘K sends podcast channels and episodes
  to `/podcasts?…`.

**Files.** New: `lib/chapters.ts`, `app/podcasts/page.tsx`,
`app/api/videos/[id]/chapters/route.ts`. Changed: `lib/schema.ts`,
`lib/db.ts`, `lib/youtube.ts`, `lib/ingest.ts`, `lib/nav.ts`,
`lib/search.ts`, `lib/videoColumns.ts`, `lib/youtubePlayer.ts`,
`app/api/videos/route.ts`, `app/api/channels/route.ts`,
`app/api/channels/[id]/route.ts`, `components/feed/FeedClient.tsx`,
`components/feed/useFeedData.ts`, `components/feed/FeedSidebar.tsx`,
`components/feed/FeedEmptyState.tsx`, `components/feed/StudyPanel.tsx`,
`components/feed/VideoCard.tsx`, `components/feed/model.ts`,
`components/PlayerModal.tsx`, `components/TopBar.tsx`,
`components/GlobalSearch.tsx`, `components/channels/*` (row, page, add
bar), `components/types.ts`.

**Refined with the owner (2026-10-22), not yet deployed.**
- **Continue listening is a slim strip**, not a row of full cards (that row
  was ~300 px and pushed new episodes down): small tiles with the real
  thumbnail, title, a yellow progress bar and "29:08 left", in one row that
  scrolls sideways (`components/feed/ContinueStrip.tsx`). ‹ › arrows appear
  only when there's more that way (no "load more"). Up to 12 episodes
  (`CONTINUE_LIMIT`). "New episodes" heads the grid under it. Verified with
  6 test resume points (later reset): strip 94 px with its heading, 6
  thumbnails; arrows: start ›, middle ‹ ›, end ‹.
- **Length by the hour on Podcasts:** "Any length · Under 1h · 1–2h · 2h+"
  (`under1h`, `1to2h`, `over2h` in `/api/videos`), since almost every
  episode is over 30 min. The Feed keeps <10m / 10–30m / 30m+. Local
  Waveform: 1 / 58 / 3 of 62.

**Fixed after deploying (owner).** Adding a podcast channel said "See its
videos →" but linked to the Feed (`/?channel=…`), where podcast channels no
longer show. The link now follows the channel's home
(`/podcasts?channel=…` for podcasts), in `AddChannelBar.tsx`.

**Verified** (local, real data). Chapter parser: "0:00 Intro",
"(00:00)", "[05:10]", "Intro 0:00", "1:02:33" all read; lists not starting
at 0:00, with fewer than three, out of order or past the end rejected.
Restart ran the new columns once (schema stamp). Nav: Feed 2,198, Podcasts
92. Feed page and Feed Shorts contain **no** podcast videos (0 of 24 and 0
of 24); Podcasts lists only Waveform (62 episodes, 30 Shorts). Real
chapters: 11, 8 and 13 on three episodes. In the app: the Podcasts tab,
title and sidebar; cards and panel show Chapters; clicking "5:14 Apple
Homeview" opened the player at `start=314` with 11 chips and that one
highlighted; Next jumped the real video to 26:55 (YouTube's own chapter
label agreed) and the highlight followed; closing put the episode under
Continue listening (resume 27:00). The test resume was reset to 0
afterwards (one 10 s chunk stays marked played). The Feed is unchanged
(Inbox, genres, Transcript tab). ⌘K: "wvfrm" returns the channel with
section `podcasts`. Typecheck and lint pass. **v2** (Gemini chapters) not
started.

#### FEAT-15 · Cheat sheets: unique questions across your notes — ✅ built · 2026-10-21

**The idea (owner).** In the Notebook, search a topic ("hash map", maybe
within the Interview genre), and get **one clean list of the unique
questions** about it across every note, each pointing back to the videos it
came from. Plain search already finds the notes; the cheat sheet merges what
they say into one revision page. Named "cheat sheets" by the owner (over
"question lists/sets", "roundups", "digests").

**Why this shape (from the size discussion).** Sending whole notes was
measured first: an Ask answer averages ~2.7 KB (~680 tokens), so 154 notes
≈ 105k tokens and 500 notes ≈ 340k, over the free tier's 250k tokens per
minute for one request. Sending only the **matching lines** keeps a sheet at
roughly 1–2k tokens, far inside every limit, at any notebook size. The
trade-off, accepted: a related question that never mentions the words
("what is load factor?" with no "hash map" nearby) isn't included. Finding
notes by meaning (embeddings) stays a possible later upgrade.

**How it works, step by step.**
1. **Search** in the Notebook as today. Matching is REF-13's loose match, so
   "hash map" also finds "HashMap" and "ConcurrentHashMap". The genre
   filter narrows it (e.g. Interview).
2. **Collect the matching lines** from the matching answers and your own
   notes, each tagged with its video. Rules, based on the real answers (38
   answers: ~844 bullets, 149 headings, mostly **bold lines**, 108 numbered
   items, 72 nested bullets, usually a "*Solution:*"):
   - a match in a **bullet or numbered item** → that item's own text (not
     its nested sub-bullets, which are answers, not questions);
   - a match in a **heading** (a `#` heading or a line that is only
     **bold**) → the heading **plus every item under it**, up to the next
     heading. This is the owner's favourite part: a "**HashMap
     internals**" section brings its questions even when they don't say
     "hash map" themselves;
   - a match in a **plain line** → that line;
   - your own notes (plain text): the matching line; a line ending in ":"
     counts as a heading for the lines under it, up to a blank line.
   - Each item is trimmed to ~300 characters; exact duplicates are dropped
     before sending.
3. **One Gemini call** through the normal model chain (FIX-06): "These are
   questions about hash map from N videos. Merge the ones asking the same
   thing; return each unique question once, with the videos it came from."
   The reply is requested as **JSON** (`[{question, videoIds}]`) so the
   links can't be garbled. `runChain()` needs a small option for the JSON
   reply format.
4. **Show it** on the right side of the Notebook, where a video normally
   opens. Questions are ordered by **how many videos asked them**, most
   first (handy for interview prep: the common ones lead), each with
   "asked in 3 videos" and the video names as links. A link opens that video
   with the sheet's search applied, so REF-12 jumps straight to the line.
   **Copy as Markdown** like a video.

**Saving and updating.**
- Every sheet is saved. The Notebook's left list gets a **CHEAT SHEETS**
  group at the top: "Hash map · Interview · 15 questions · today".
  Reopening one is instant and makes **no Gemini call**.
- The same search and genre again **updates** that sheet instead of making a
  duplicate.
- **"4 new matching lines since. Update?"**: the browser already holds every
  note, so on opening a sheet it re-collects the lines (free, no server
  call) and compares a fingerprint with the saved one. Update = one call.
- Each sheet can be deleted.

**In ⌘K global search.** A new group, **CHEAT SHEETS · IN YOUR NOTEBOOK**,
with a **SHEET** badge (like GEMINI and NOTE on answers) and the subtitle
"Notebook · Interview · 15 questions · today", so it's clear where it
lives. Clicking opens the Notebook at that sheet (`/notebook?sheet=7`).

**The button.** Appears in the Notebook while a search is active, e.g.
"**Make a cheat sheet** · 23 matching lines". Past a size cap (around 400
lines or ~40k characters) it says to narrow the search or pick a genre
instead of sending.

**Data and code (planned).**
- New table `cheat_sheets`: `id`, `query` (as typed), `genre_id` (null =
  all genres), `questions` (jsonb `[{question, videoIds}]`), `line_count`,
  `lines_hash` (fingerprint of the lines used, for "new since"), `model`,
  `created_at`, `updated_at`; unique on (normalised query, genre). Added to
  `lib/db.ts`'s list, so PERF-05's stamp changes and the first cold start
  creates it once.
- `lib/cheatSheet.ts`: the line collection (pure, shared by the browser for
  "new since" and the server for building) and the Gemini step.
- API: `POST /api/cheat-sheets` (query, genre: the **server** collects the
  lines itself, so it never trusts a list sent from the browser), `GET`
  (list and one), `DELETE`.
- `lib/search.ts` gains cheat sheets for ⌘K.
- UI: the Notebook button, the CHEAT SHEETS group, a sheet view in the
  reader area, `?sheet=` in the address.

**Costs.** One Gemini call per sheet or update (counts toward the daily cap
of 100); typically 1–2k tokens. Opening, copying and "new since" checks
cost nothing. No YouTube, Apify or Firecrawl use.

**Owner's choices.** Short answers included (the nested "*Solution:*"
lines go along with their question, option B); "asked in N videos" counts
shown; button "Make a cheat sheet · 23 matching lines".

**As built (differences from the plan above).**
- A matching **sub-point** also brings its parent item (a "Solution: use
  ConcurrentHashMap" line belongs to a concurrency question).
- `lib/looseMatch.ts` (moved out of `components/ui/highlight.tsx`) holds the
  loose match, so the browser and the server match identically;
  `lib/cheatSheetLines.ts` is the pure line collector and fingerprint;
  `lib/cheatSheets.ts` the server side (load sources, size checks, upsert);
  `buildCheatSheet()` in `lib/gemini.ts` the call (videos numbered 1…n in
  the prompt, JSON reply checked; `runChain()` gained an optional JSON
  schema). Routes: `GET`/`POST /api/cheat-sheets`, `DELETE
  /api/cheat-sheets/[id]`.
- The table stores `genre_key` as text ("all", "none" or a genre id), the
  same values as the Notebook's genre filter, and `query_key` (the loose
  form), unique together: "Hash Map" and "hashmap" are one sheet.
- When a sheet already exists for the search, the button becomes "Open the
  hash map cheat sheet" (no accidental second call); updating is from the
  sheet's "new matching lines since" bar.
- Titles show the search with a capital first letter ("Hash map cheat
  sheet"). Deleting asks "Delete it?" inline.
- The saved sheets live in a **"Cheat sheets N" tab** of the list's Show
  switch (All, Answers, My notes, Cheat sheets), filtered by the search and
  the genre; the reader opens the first one. A first version put a CHEAT
  SHEETS group on top of the list; the owner rejected it because it pushed
  the videos down. A `?sheet=` link opens on that tab.
- The way in, in the **owner's own words**: one quiet line under the
  search, "Worried about duplicates? **Ask** ✦", where ✦ is the **Gemini
  sparkle** (`components/ui/GeminiMark.tsx`: Gemini's four-pointed star in
  its blue-to-pink gradient, drawn inline, no image file) standing in for
  the word; it turns a quarter on hover. When a sheet exists for the
  search: "Already asked ✦ **Open the cheat sheet**". "duplicates" carries the thick
  yellow underline (the same stroke as FIX-07's "Added to …"). While a
  sheet is being made, the sparkle spins and the line moves on every 2.2 s:
  "Gemini is reading 27 lines from 8 videos…", "…spotting the questions
  that keep coming back…", "…folding the look-alikes into one…",
  "…putting the most-asked on top…" (`CheatSheetMaking`). The GEMINI badge
  on answers (Notebook and ⌘K) now carries the sparkle too.
- Deleting: the bin turns **red** on hover (never the yellow "on" colour);
  pressing it swaps it, in place, for a filled red **Delete** and a green
  **Keep** (tile green with the "ok" green border). A dark bar copied from
  the track delete was tried first and rejected by the owner. It replaced a big
  yellow "Make a cheat sheet · N matching lines" button; the alternatives
  shown before it (an icon in the search box, a first list row, a small
  button by the counts, a bar over the reader, the pen note, a selection
  toolbar, a ⌘K action, topic chips, flashcards) were all rejected.
- The list's counts got a line of their own under the Show switch
  ("33 videos · 38 answers · 0 notes", or "4 cheat sheets"), with "Clear
  filters" on the right of it: the fourth tab had squeezed them into a
  ragged column.

**Files.** New: `lib/looseMatch.ts`, `lib/cheatSheetLines.ts`,
`lib/cheatSheets.ts`, `app/api/cheat-sheets/route.ts`,
`app/api/cheat-sheets/[id]/route.ts`,
`components/notebook/CheatSheetView.tsx`. Changed: `lib/schema.ts`,
`lib/db.ts` (table + unique index), `lib/gemini.ts`, `lib/search.ts`,
`components/GlobalSearch.tsx`, `components/notebook/NotebookClient.tsx`,
`components/notebook/NotebookReader.tsx` (exports `CopyMarkdownButton`),
`components/notebook/model.ts`, `components/types.ts`,
`components/ui/highlight.tsx`.

**Verified** (local, real notebook). Line collector on real notes: "hash
map" 17 excerpts from 10 videos, ~440 tokens; "auto-configuration" 24
excerpts, a heading bringing its questions and Solution lines; "spring boot"
~3,000 tokens. The restart after adding the table ran 27 statements once
under a new schema version (PERF-05 working as designed). In the app: the
button read "Make a cheat sheet · 17 matching lines"; one real Gemini call
made **12 unique questions**, most-asked first ("HashMap vs
ConcurrentHashMap?" asked in 3 videos), short answers where the notes had
them. Reopening via `?sheet=1` made no POST (no Gemini). No "new lines"
banner on a fresh sheet, so browser and server fingerprints agree. ⌘K for
"hashmap" listed it under CHEAT SHEETS · IN YOUR NOTEBOOK. A video chip
opened that video with the search set and jumped to the match. A topic in no
notes: 400, "Nothing in your notes mentions …", no call. Delete of a missing
id 404, a bad id 400. No server errors; typecheck and lint pass. **Not
exercised yet:** the "new matching lines since → Update" path (needs a note
to change) and deleting a real sheet from the screen; the "hash map" sheet
was kept for the owner.

### CLEAN — code cleanup (Phase 10)

The rule for all of Phase 10: reorganise, don't change behaviour. Two
deliberate exceptions, both noted below: a malformed id now gets "400 Invalid
id." instead of a server crash (CLEAN-03), and a Stop pressed on one backfill
no longer cuts a later channel-add short (CLEAN-04). Each step was checked
with typecheck, lint, a production build, and by using the screens it
touched; anything that changes data was tried only in a reversible way and
then put back.

#### CLEAN-01 · Names that say what they are — ✅ done · 2026-10-17 (Phase 10, step D)
**The problem**
The shared CSS helpers were still called `.nb`, `.nb-input`, `.nb-btn` and
`.nb-chip` ("neobrutalist", from before the redesign), two of them weren't
used at all, and 22 places read old colour aliases (`var(--ink)`,
`var(--paper)`, `var(--accent)`) instead of the v2 tokens. Fifteen functions
and types were exported although nothing outside their file used them.

**The change**
- `.nb` → `.card`, `.nb-input` → `.field`, `.nb-chip` → `.chip`; `.nb-sm`
  and `.nb-danger` deleted (unused); `.nb-btn` deleted — its one user, the
  login button, now uses the shared `Button` (and says "Let me in" /
  "Checking…" in sentence case, which UI-04 had missed).
- Every old alias replaced by the real token (`var(--color-ink)` …), and the
  alias block removed from `globals.css`.
- `export` removed from the 15 items only used inside their own file;
  `Icon.tsx` reuses `IconShape` instead of spelling the type out again.

**How it works**
Renames done by search-and-replace over whole words, then a sweep for any
spelling of the old names (in class strings, inline styles and `lib/`). The
sweep caught one that would have broken: `lib/color.ts` returns
`"var(--ink)"` as the text colour on genre chips — fixed to
`var(--color-ink)`. Its contrast constant (`#161616`) was left exactly as
is: nudging it to v2's ink could flip a chip's text from black to white for a
borderline colour, and Phase 10 changes nothing you can see.

**Key code** — `app/globals.css`
```css
/* A text input, select or textarea. */
.field { border: 1px solid var(--color-line); border-radius: var(--radius-md); background: var(--color-surface); }
.field:focus { border-color: var(--color-ink); box-shadow: 0 0 0 3px rgb(255 208 43 / 0.45); }
```

**Alternatives considered**
- *Keep the old names:* harmless to the user, but every future reader would
  wonder what "nb" means and whether `.nb-btn` or `Button` is the real one.

**Files** — `app/globals.css`, `lib/color.ts`, `components/LoginForm.tsx`,
`components/Mascot.tsx`, `components/channels/GenreColorPicker.tsx`,
`components/ui/Icon.tsx`, the 17 files using `.field`/`.card`/`.chip`, and
`lib/{search,youtubePlayer,askSuggestions,gemini,youtube,ingest}.ts`
(exports).

**Verified** — no old class or alias left anywhere (sweep); built CSS has
`.field`, `.card`, `.chip` and no `nb-` or `--paper`; screens look as before.
*Gotcha met on the way:* the dev server kept serving the old stylesheet
(Turbopack's stale-CSS cache), so text boxes briefly showed without borders —
fixed by stopping the server, `rm -rf .next`, restarting; the code was fine.

#### CLEAN-02 · Shared building blocks instead of copies — ✅ done · 2026-10-17 (Phase 10, step A)
**The problem**
The same code was written several times: the search box 6 times, "call the
API and show its error" 19 times, the Ask flow twice (today's "question stays
in the box" fix had to be made in both), the empty-state card 3 times, images
7 times (each with its own lint exception), menus closing on an outside click
twice, the search highlighter twice, copy-to-clipboard 3 times, and two long
class strings 11 and 5 times. Copies drift: fix one, forget another.

**The change**
| New shared piece | Replaces | Where |
|---|---|---|
| `SearchField` | 6 search/filter boxes | `components/ui/SearchField.tsx` |
| `EmptyState` | 3 empty-state cards | `components/ui/EmptyState.tsx` |
| `label-caps`, `focus-within-ring` CSS utilities | 11 small-label strings, 5 focus-ring strings | `app/globals.css` |
| `Thumb`, `Avatar` | 7 images; the one lint exception and the `no-referrer` rule now live here | `components/ui/Media.tsx` |
| `useDismiss` | 2 click-outside/Esc menu handlers | `components/ui/useDismiss.ts` |
| `api()` | 18 of the 19 "fetch → JSON → throw data.error" blocks (the feed's page loader stays, see below) | `lib/api-client.ts` |
| `useAsk` | the Ask flow in the study panel and Notebook | `components/useAsk.ts` |
| `highlight()`, `useCopy` | 2 highlighters, 3 clipboard copies | `components/ui/highlight.tsx`, `ui/useCopy.ts` |

Also: the saved-answer type `Answer` now lives once in `components/types.ts`.

**How it works**
Each shared piece takes options for the small ways the copies differed, so
every screen behaves exactly as before. Examples:
- `SearchField`: `clearable`, `escClears`, `hint` (the ⌘K label), `onClear`.
  Global search uses Esc to close its panel, so it turns `escClears` off, and
  its ✕ empties the box *without* reopening the panel (`onClear`), as before.
- `api()`: one place that sends JSON, reads the reply, and throws the
  server's own message (or the caller's `fallback`). A reply that isn't JSON
  now reads as `{}` (a friendlier error than "Unexpected token <").
- `useAsk`: the box empties when you send, and gets your text back if it
  fails; each screen passes what to do with the answer (the study panel adds
  it to the conversation, the Notebook scrolls to it).

Deliberately *not* converted: the feed's page loader. It ignores a failed
reply when a newer request has already replaced it (quick filter switching);
`api()` would surface that stale error. The other conversions keep each
call's own error message.

**Key code** — `lib/api-client.ts`
```ts
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(data.error ?? fallback);
return data as T;
```

**Alternatives considered**
- *A UI library (Radix, Headless UI) for search boxes and menus:* more than
  we need; our pieces are small and already styled.
- *Merge the study panel and the Notebook reader entirely:* they show
  answers differently (conversation vs. cards); sharing the Ask *logic* was
  the part that was really the same.

**Files** — new: `components/ui/{SearchField,EmptyState,Media,highlight}.tsx`,
`components/ui/{useDismiss,useCopy}.ts`, `components/useAsk.ts`,
`lib/api-client.ts`; changed: the files that used the copies (feed, sidebar,
global search, study panel, Notebook, Tracks, Channels, genres panel, track
menu, note editor, top bar, login, copy button), `app/globals.css`,
`components/types.ts`.

**Verified** — by using each one: all search boxes (typing filters, ✕, Esc,
global search's panel/⌘K behaviour unchanged); both menus close on outside
click and Esc but not other keys, and switching between row menus works;
Ask in the Notebook and the study panel with an already-saved question
(returns the stored answer — no Gemini call; box empties on send; answer not
duplicated); "Copy as Markdown", an answer's Copy and "Copy all" (the
browser pane blocks clipboard writes, so a stand-in clipboard was used to
check the flow); highlights in global search keep the original casing;
Tracks loads through `api()`.

#### CLEAN-03 · API routes: one login check, safe ids — ✅ done · 2026-10-17 (Phase 10, step B)
**The problem**
31 route handlers each repeated the same three-line login check. And 17
places turned the URL's id into a number without checking it: `/api/videos/abc`
reached the database as `NaN` and came back as a 500 — the tracks route even
returned the raw SQL in its error.

**The change**
- `lib/auth.ts`: `unauthorized()` (the one 401 reply) and
  `denyUnlessAuthed()`; every protected handler starts with
  `const denied = await denyUnlessAuthed(); if (denied) return denied;`. The
  scheduled sync keeps its own rule (Netlify's secret *or* the login) and
  shares the 401 reply.
- `lib/http.ts`: `parseId()` (a positive whole number, or null) and `badId()`
  ("400 Invalid id."); every `[id]` route parses first.

**How it works**
The login check is still visible at the top of every handler — a deliberate
choice over moving it into Next's proxy, which would change *how* every
request is protected at once. A script confirmed the check is the first
statement of all 31 handlers (two note the start time first, for the 6 s
backfill budget — no data is touched before the check).

**Key code** — `lib/http.ts`
```ts
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
```

**Alternatives considered**
- *Next 16's `proxy.ts` (middleware) for login:* one place, but a bigger
  change to how security works, for no visible gain.
- *Wrap every handler (`withAuth(handler)`):* changes all 33 signatures;
  more churn than the two-line guard.

**Files** — `lib/auth.ts`, `lib/http.ts` (new), every `app/api/**/route.ts`
except `login`.

**Verified** — real requests: bad ids (`abc`, `4.5`, `-1`, `0`) on GET,
PATCH, POST and DELETE routes all answer "400 Invalid id." (refused before
anything is touched); good ids still return data; missing-but-valid ids still
answer their usual 404. The 401 path can't be triggered locally (no
password set); check once after deploying with a logged-out request.

#### CLEAN-04 · Screens in their own folders, big files split — ✅ done · 2026-10-17 (Phase 10, step C)
**The problem**
Four files held most of the app — Channels 971 lines, Feed 812, Notebook 709,
Tracks 660 — each with several components inside, and every component sat in
one flat folder.

**The change**
Each screen got a folder for the parts only it uses; shared parts stayed at
the top of `components/`:

| Folder | Files |
|---|---|
| `components/feed/` | `FeedClient` (562), `useFeedData` (loading, counts, ✓/bookmark/progress), `FeedEmptyState`, `FeedSidebar`, `VideoCard` (+ `VideoCardSkeleton`), `StudyPanel`, `TrackMenu`, `model` |
| `components/notebook/` | `NotebookClient` (361), `NotebookReader`, `ListControls`, `model` |
| `components/tracks/` | `TracksClient` (313), `TrackPath`, `model` |
| `components/channels/` | `ChannelsClient` (492), `AddChannelBar`, `ChannelRow`, `TableParts`, `model`, `GenresPanel`, `GenreColorPicker`, `AskSuggestionsEditor` |
| `components/` (shared) | `TopBar`, `GlobalSearch`, `PlayerModal`, `NoteEditor`, `CopyButton`, `Markdown`, `Mascot`, `LoginForm`, `StyleguideClient`, `types`, `useAsk`, `ui/` |

**How it works**
- *Moves:* a script resolved every import from the file's old place to its
  new one and rewrote it (same folder → `./X`, elsewhere →
  `@/components/...`); the typecheck then confirmed every import resolves.
- *Splits:* pieces were cut by copying their code text, not retyping it, so
  logic and markup stay the same; the page passes what each piece needs as
  props.
- *The feed:* the natural seam wasn't "loading" alone — the ✓ and bookmark
  toggles adjust the same counts the loader fills in. So `useFeedData` owns
  everything that keeps the grid and its counts in step (pages, facets,
  totals, Watch-later counts, the toggles, progress updates), and tells the
  page about each change (`onPatched`) so the study panel's copy of a video
  stays in step, as before.
- *A bug found and fixed:* pressing Stop on a backfill left a "stop" flag
  set; the next channel *add* read the same flag, so a busy channel would
  quietly stop after its first page. The add bar now never stops early (it
  has no Stop button); backfills keep their own flag.

**Key code** — `components/feed/FeedClient.tsx`
```tsx
const { videos, totals, facets, loadPage, toggleWatched, toggleLater, applyProgress, … } =
  useFeedData({ kind, view, genreId, channelIds, search: debouncedSearch, lengthFilter }, {
    onError: setToast,
    onPatched: (id, patch) => setStudy((s) => (s && s.video.id === id ? { ...s, video: { ...s.video, ...patch } } : s)),
  });
```

**Alternatives considered**
- *Only split, keep one flat folder:* the split files would still be hard to
  find; folders say which screen a file belongs to.
- *Move every component into folders (shared ones too):* shared pieces
  belong to no single screen; leaving them at the top says exactly that.
- *Feed: a separate hook for loading only:* would leave the counts
  maintained in two places.

**Files** — everything under `components/feed/`, `notebook/`, `tracks/`,
`channels/`; `app/page.tsx`, `app/notebook/page.tsx`, `app/tracks/page.tsx`,
`app/channels/page.tsx` (imports).

**Verified** — every screen used after its split:
- *Channels:* `#add` focuses the box; 14 rows; sorting by videos and genre;
  ticking a row shows the bulk bar; a row's Delete… selects just that row
  and shows the confirm with the right counts; Cancel (nothing deleted);
  looks identical.
- *Notebook:* list, selecting (address `?v=` kept through a reload),
  filters, Copy as Markdown / Copy all, Ask with a saved question.
- *Tracks:* list, block bar, Up next, steps, Rename (name pre-selected) →
  Cancel, Delete → Keep it, hover labels.
- *Feed:* every view's count and summary (Inbox 801, Later 1, Watched 1,
  Everything 802, Tech 482, 30m+ 211), Load more (48 cards), search with the
  "No matches" state and Clear, `?video=` opens the panel and the address
  tidies to `/`, Esc closes it, Shorts with "Play unseen in a row"; bookmark
  saved and removed (Later 1 → 2 → 1) and the one watched video un-marked and
  re-marked (Inbox 801 → 802 → 801), then confirmed on the server that
  everything is exactly as before.
- Typecheck, lint and production build pass.

#### CLEAN-05 · Docs that match the code — ✅ done · 2026-10-17 (Phase 10, step E)
**The problem**
REDESIGN.md had grown to 2,650 lines: the current design system, the
decisions and the plan were buried between thousands of lines of finished
write-ups. ARCHITECTURE.md's UI section was a phase-by-phase diary.

**The change**
- REDESIGN.md keeps what you need now: Resume here, goals, the v2 design
  system, the decisions log, a one-line index of every change, the build
  plan, flows and the changelog.
- This file (`redesign-history.md`) keeps the full change catalogue (every
  item's seven sections), the Phases 1–8 design values and the old
  feature-status table — plus a map from old file paths to new ones.
- ARCHITECTURE.md's UI section now describes how the UI is built today.

**How it works** — sections were moved, not rewritten; the index in
REDESIGN.md is generated from the item headings, so it can't disagree with
them.

**Key code** — none (documentation).

**Alternatives considered**
- *One file per item:* dozens of tiny files; harder to read in order.
- *Delete finished write-ups:* they explain why the code is the way it is.

**Files** — `docs/REDESIGN.md`, `docs/redesign-history.md` (new),
`docs/ARCHITECTURE.md`.

**Verified** — every ✅ item still has all seven sections (checked by
script); the item count in the index matches the history file.

### PERF — speed

#### PERF-03 · Instant screens: remembered data and reused pages — ✅ done · 2026-10-17
**The problem**
Measured on the live site from India: every request takes 0.6–1.1 s (4.4 s
after the server sleeps) — most of it the trip to the US-hosted server, not
the work. Switching tabs paid that twice: once for the page (the server
re-sends it to check the login), then for the screen's data (the feed makes
five requests). Coming back to a screen you'd just seen meant waiting again.

**The change**
- **Remembered data:** each screen keeps the last reply for each request in
  the tab's memory and shows it at once when you come back, then fetches a
  fresh copy in the background and swaps it in. Feed (each filter's first
  page, genres, channels, suggestions), Notebook, Tracks (list and each
  track), Channels, the top-bar counts, a video's saved answers.
- **Reused pages:** `next.config.ts` `experimental.staleTimes.dynamic: 300`
  — a page visited in the last 5 minutes isn't re-requested from the server.

**How it works**
Like a notepad by the phone: you read out what you wrote down last time
straight away, while checking for anything new.
- `lib/api-client.ts` keeps the store: every successful GET through `api()`
  is remembered (newest kept; capped at 30; memory only, gone on reload; never
  on the server, where one store would be shared between requests). Screens
  start their state from `rememberedReply(path)`, so the first draw already
  has the data and the placeholders never show.
- **Staying honest:** any change through `api()` — ask, note, track, channel,
  genre, suggestions — and a sync clear everything remembered, so no stale
  copy outlives an edit. The feed's frequent ✓ / bookmark / progress changes
  don't clear (that would undo the point); they rewrite the remembered feed
  pages in place (`patchRemembered` in `useFeedData`), so a video you just
  ticked never reappears unticked.
- A failed refresh keeps what's on screen (Notebook, Channels, counts)
  instead of replacing it with an error.
- Reusing pages is safe because the pages carry no data: they check the login
  and hand over to the screen, which loads its data itself.

**Key code** — `lib/api-client.ts`
```ts
const changes = method !== "GET" || path.startsWith("/api/cron");
if (changes) forgetRemembered();
if (!res.ok) throw new Error(data.error ?? fallback);
if (!changes) remember(path, data);
```

**Alternatives considered**
- *Smaller thumbnails* (165 KB → 20 KB each): the biggest download saving,
  declined by the owner — the look stays as it is.
- *Load the study panel / player code only when opened:* a small gain on a
  laptop; skipped.
- *Send the first screen's data with the page* (one round trip instead of
  ~6 on first load): bigger rework of every screen; for later.
- *Move the server and database nearer India:* the biggest lever (every
  request ~0.8 s → ~0.2–0.3 s), but a database move shared with the sister
  app; for later.
- *A library (SWR, React Query):* does the same and more, but adds a
  dependency and a second way of loading data; ours is ~40 lines on top of
  `api()`.

**Files** — `lib/api-client.ts`, `next.config.ts`, `components/feed/useFeedData.ts`
(`feedParams`/`feedPath`, remembered first page, `patchRemembered`),
`components/feed/FeedClient.tsx`, `components/TopBar.tsx`,
`components/notebook/NotebookClient.tsx`, `components/tracks/TracksClient.tsx`,
`components/channels/ChannelsClient.tsx`, `components/channels/AskSuggestionsEditor.tsx`,
`components/channels/GenresPanel.tsx` (genre delete through `api()`, error
now shown), `components/feed/StudyPanel.tsx`. (The production build was
tested locally with `npm run build && npm run start`.)

**Verified** — on a local production build, Notebook → Feed → Notebook →
Feed: first visit 1 page request + placeholders; every revisit **0 page
requests, no placeholders, content in ~18 ms**, with the same background
refresh requests as before (no extra work). Correctness, each reversed after:
a bookmark made on the feed shows on the remembered copy; a bookmark made
outside the tab shows "not saved" first and "saved" once the refresh lands
(~1 s); a change (re-asking a saved question — no Gemini call) clears the
memory, so the next screen loads fresh. Typecheck, lint, build pass.
*Trade-off accepted:* a revisited screen can show its previous numbers for
about a second before the refresh; and if the login expired within 5
minutes, a revisited page shows its remembered content until a reload.


#### PERF-04 · Lighter thumbnails, first row first — ✅ done · 2026-10-18

**The problem.** Netlify's Real User Monitoring rated Largest Contentful
Paint "Poor" (p75 about 6–11 s; good is under 2.5 s). LCP waits for the
biggest thing on screen, which on the feed is the first row of thumbnails.
Those were full-size JPEGs of 136–245 KB each, and every one was marked
`loading="lazy"`, including the ones visible straight away, which the
browser deprioritises. (The rest of the wait is cold starts, 2–4 s after
idle, and distance to the server; neither is touched here.)

**The change.** (1) Thumbnails come as WebP: the same 1280×720 picture
YouTube makes for every video, at about half the bytes. Compared side by
side on real cards, the owner couldn't tell them apart. (2) The feed's
first 6 cards (a row is at most 6 wide) load at once with
`fetchpriority="high"`; the rest stay lazy.

**How it works.** `Thumb` (`components/ui/Media.tsx`) rewrites
`i.ytimg.com/vi/<id>/<size>.jpg` to `i.ytimg.com/vi_webp/<id>/<size>.webp`
and falls back to the JPEG if the WebP is missing. A missing WebP doesn't
always raise an error: YouTube can answer with a 120px grey placeholder
that loads fine. So `onLoad` also switches to the JPEG when the image is
120px or narrower. Every stored size is wider: maxres 1280, hq 480.
`VideoCard` takes `priority`; `FeedClient` passes it for `i < 6`.

**Key code.**
```tsx
function webpOf(src: string): string | null {
  const m = /^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\/([a-z0-9_]+)\.jpg$/.exec(src);
  return m ? `https://i.ytimg.com/vi_webp/${m[1]}/${m[2]}.webp` : null;
}
// …
onError={switchToJpeg}
onLoad={(e) => { if (e.currentTarget.naturalWidth <= 120) switchToJpeg(); }}
```

**Alternatives considered.** *Smaller thumbnails* (hq/mq) save even more,
but the owner declined them in PERF-03 because they change the look. WebP
keeps the full size. *Keeping the server and database warm with pings* would
use more of Neon's free monthly compute than allowed (the database is
shared with the sister app), and would only warm one Netlify instance while
a page load fires about 5 requests. *Moving the server and database nearer
India* is still the biggest lever, and is still parked.

**Files.** `components/ui/Media.tsx` (now a client component, for the
fallback state), `components/feed/VideoCard.tsx`, `components/feed/FeedClient.tsx`.

**Verified** (local, real thumbnails). The first page's 24 thumbnails went
from 4,767 KB to 2,163 KB (55% less); the first row from 1,254 KB to
591 KB. All load as WebP at 1280px with none broken, and cards 1–6 are
`eager` + `fetchpriority="high"` while 7+ stay `lazy`. Pointing a card at a
missing WebP made it switch itself to the 1280px JPEG; the first version
of the fallback (`onError` only) failed this test, which is how the
placeholder case was found. WebP existed for 40/40 sampled stored
thumbnails. Typecheck and lint pass. The live LCP graph will show the
effect about a day after deploying.

#### PERF-05 · Cold starts skip the schema check (audit B2) — ✅ done · 2026-10-21

**The problem.** Every new Netlify instance (a "cold start") ran the whole
schema list in `lib/db.ts` before serving its request: 25 statements (1
extension, 9 tables, 8 added columns, 7 indexes), all `IF NOT EXISTS`, so
the answer was almost always "already there". Since PERF-02 the list runs
behind an advisory lock (only one instance at a time, to prevent the
September deadlock). Opening the feed fires about 5 requests at once, so
after an idle spell 5 or 6 fresh instances queued at that lock one behind
the other. The deploy logs showed 6 instances cold-starting together at
07:30:10, each losing about 1 s to the check and the queue. ChatGPT's audit
flagged it as "schema setup on the request path" (§4 · P1).

**The change.** The list is stamped with a fingerprint of its own text,
stored in `app_meta` as `schema_version`. A cold instance first reads that
one row. If it matches, the schema is current: no lock, no queue, no DDL.
Only when it doesn't match (a brand-new database, or right after the list
was edited) does the instance run the full list once and write the new
stamp.

**How it works.**
- `SCHEMA_VERSION` is the first 12 hex characters of a SHA-256 of the DDL
  list. Editing the list changes it by itself, so nobody has to remember to
  bump a version and nothing can be skipped by mistake.
- `schemaIsCurrent()` is a plain Drizzle read of the stamp. On a brand-new
  database `app_meta` doesn't exist and the read fails; that counts as "not
  current". If the database is unreachable instead, the full setup that
  follows throws the real error.
- The setup block keeps PERF-02's single round trip and advisory lock, and
  now **checks the stamp again after taking the lock**. When several
  instances cold-start right after a schema change, the first runs the list
  and stamps it; the ones queued behind it find the new stamp and return
  without running anything. The check is a nested `IF` because PL/pgSQL
  plans a statement only when it reaches it, so on an empty database the
  `app_meta` SELECT is never planned.
- The stamp is written with `ON CONFLICT … DO UPDATE` at the end of the same
  transaction, so it only exists if the whole list succeeded.
- The cold-init log line now ends either `(skipped, version 405bef37620f
  is current)` or `(25 statements, version 405bef37620f)`.

**Key code.**
```ts
const SCHEMA_VERSION = createHash("sha256")
  .update(DDL.join(";"))
  .digest("hex")
  .slice(0, 12);

const current = await schemaIsCurrent(db);
if (!current) await db.execute(sql.raw(schemaSetupBlock()));
```
```sql
DO $$ BEGIN
PERFORM pg_advisory_xact_lock(7201314);
IF to_regclass('app_meta') IS NOT NULL THEN
  IF EXISTS (SELECT 1 FROM app_meta WHERE key = 'schema_version' AND value = '…') THEN RETURN; END IF;
END IF;
-- the 25 statements
INSERT INTO app_meta (key, value) VALUES ('schema_version', '…')
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
END $$
```

**Alternatives considered.** *Run the schema at deploy time* (the audit's
suggestion): it would also remove the one remaining round trip, but needs
the database password during the Netlify build, makes a deploy fail
whenever Neon is asleep or down, and would need a separate path for local
PGlite. The stamp gets almost all of the gain and keeps TUBEBOX zero-setup.
*A hand-written version number*: works, but relies on remembering to bump
it; the fingerprint can't be forgotten. *Skip the check entirely after the
first run*: unsafe, since a new column or index would never be created.

**Files.** `lib/db.ts`.

**Verified** (local PGlite, throwaway database folders; the real local data
was never opened). Brand-new database: full setup, 9 tables, stamp
`405bef37620f` written. Restart: "skipped". Stamp changed to an old value:
full setup ran once and re-stamped, the next start skipped. The in-lock
recheck returned early before reaching a statement that would have failed
(`1/0`). A copy of the real local database (2,183 videos, no stamp yet, like
production on its first deploy): full setup once, then skipped, all videos
intact. Typecheck and lint pass. **After deploying:** the Netlify function
logs should show `skipped` on cold starts, once the first instance has
written the stamp.


#### PERF-07 · The first screen comes with the page (audit B1) — ✅ built · 2026-10-22, not yet deployed

**The problem (measured 2026-10-22 on the live site, the owner's Chrome in
India, fresh loads).** Opening the Feed was two waves: the page arrived
empty (cold: 4.5 s), then the screen made 5 requests (videos, top bar
counts, channels, genres, Ask suggestions). After idle each of them woke
its own Netlify instance: Netlify's logs showed **6 cold starts for one
open**, 3.3 to 3.6 s each. Cards appeared at **8.2 s**, the first row of
thumbnails at 8.5 s. Warm: cards at 1.2 to 1.6 s, but one of the 5 still
woke a new instance, so the sidebar or counts filled in at ~4 s. Netlify's
LCP was rated "Poor" (§4 · P1 of the audit).

**The change.** The Feed and Podcasts pages gather their first screen on
the server, inside the page's own request, and hand it to the screen. The
HTML now contains the 24 cards and their thumbnail links, so the browser
starts loading thumbnails before any JavaScript runs, and opening the page
makes **no** data requests.

**How it works.**
- The logic moved out of the API routes into shared functions, so the page
  and the API run the same code: `lib/feedVideos.ts` (`listFeedVideos`,
  `parseFeedQuery`), `lib/channels.ts` (`listChannels`), `lib/genres.ts`
  (`listGenres`); the routes now just parse and call them.
- `lib/firstScreen.ts` (`loadFirstScreen`) runs the opening view (Inbox,
  videos, no filters) plus nav counts, channels, genres and suggestions
  (and Continue listening on Podcasts) in parallel, JSON-round-trips the
  result so it's shaped exactly like the API replies, and stamps
  `renderedAt`. `app/page.tsx` and `app/podcasts/page.tsx` pass it as
  `first`; if gathering fails, the page opens as before.
- The screen trusts it only while it's **fresh**
  (`components/feed/firstScreen.ts`: made in the last minute and not shown
  before). PERF-03 reuses visited pages for 5 minutes, and a reused page
  carries old data, so those mounts show their remembered data and fetch,
  exactly as before. Fresh: states start from it, it's stored as this
  tab's remembered copy, and the first fetches are skipped
  (`useFeedData`'s `firstReply`, `TopBar`'s `initialNav`, FeedClient's
  genres / channels / suggestions / Continue listening). The feed's skip is
  only for the opening view: once a filter changes, every view (including
  a return to the opening one) is fetched as usual.
- Same initial data on the server and in the browser, so hydration matches
  (no warnings).

**Key code.**
```ts
// app/page.tsx
const first = await getDb().then((db) => loadFirstScreen(db, "feed")).catch(() => null);
return <FeedClient first={first} />;

// components/feed/firstScreen.ts
export function isFreshFirstScreen(first) {
  return !!first && !used.has(first.renderedAt) && Date.now() - first.renderedAt < FRESH_MS;
}
```

**Alternatives considered.** *Streaming with Suspense*: the frame first,
cards streamed in the same response. Nicer on paper, but a cold start
dominates anyway and it splits the screen into server and client parts; the
one-request version gets the main win with far less change. *Dropping
PERF-03's page reuse*: would make every page fresh but cost ~0.8 s per tab
switch again; the freshness check keeps both. *Notebook and Tracks*: not
yet; measure the Feed first.

**Files.** New: `lib/feedVideos.ts`, `lib/channels.ts`, `lib/genres.ts`,
`lib/firstScreen.ts`, `components/feed/firstScreen.ts`. Changed:
`app/page.tsx`, `app/podcasts/page.tsx`, `app/api/videos/route.ts`,
`app/api/channels/route.ts`, `app/api/genres/route.ts`,
`components/feed/FeedClient.tsx`, `components/feed/useFeedData.ts`,
`components/TopBar.tsx`, `next.config.ts` (comment).

**Verified** (local). A before/after snapshot of 30 API answers (feed and
podcasts, every view, kind, length bucket, genre, channel, search, page 2,
ids, continue, plus nav, channels, genres, suggestions) stayed
byte-identical after each step. The Feed's and Podcasts' HTML contain 24
cards and 24 thumbnail links. A fresh tab: **0 data requests** on open, no
console errors or hydration warnings. Afterwards: Shorts, back to Videos
and Load more each fetched as before; Notebook → Feed (a reused page)
fetched as before. **To measure after deploying**, the same way as the
baseline: cold and warm opens, and Netlify's cold starts per open (target:
one).


### FIX — problems found in use

#### FIX-01 · Channels with "bold" names can't be filtered — ✅ done · 2026-10-18

**The problem.** In the feed sidebar, typing "star" didn't find StarCode Kh,
though the Channels page did. His YouTube name is written in Unicode's
"mathematical bold" letters (`𝗦𝘁𝗮𝗿𝗖𝗼𝗱𝗲 𝗞𝗵`, U+1D5E6…), not plain ones. They
look like bold text, which is why the name looked bold everywhere in the
app, but to a computer they are different characters, so "star" never
matches. The Channels page found him through his handle (`@starcodekh`);
the sidebar only checked the name.

**The change.** (1) The sidebar filter also matches the handle, like the
Channels page. (2) From now on, styled letters in channel names and video
titles are turned back into plain ones when first saved.

**How it works.** `plainLetters()` in `lib/youtube.ts` rewrites only
Unicode's Mathematical Alphanumeric block (U+1D400–U+1D7FF) with NFKC, so
`𝗦𝘁𝗮𝗿𝗖𝗼𝗱𝗲 𝗞𝗵` becomes `StarCode Kh`. `resolveChannel` (channel add) and
`getVideoDetails` (sync, backfill) use it.

**Key code.**
```ts
export function plainLetters(text: string): string {
  return text.replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => c.normalize("NFKC"));
}
```

**Alternatives considered.** A blanket `normalize("NFKC")` was tried first.
It would also have rewritten ordinary titles: 8 local titles had "…" turned
into "...". Converting only at search time, in every search (sidebar,
Channels page, server search), was rejected as more places to keep in step.
A one-time fix of the names already stored was offered; the owner chose
not to touch existing rows. So StarCode Kh stays bold, but the handle finds
him.

**Files.** `components/feed/FeedSidebar.tsx`, `components/feed/FeedClient.tsx`,
`components/feed/model.ts` (`handle` on `FeedChannel`), `lib/youtube.ts`.

**Verified.** Typing "genz-c" in the sidebar finds GenZ Career only through
`@genz-career` ("1 of 15"); no console errors. `plainLetters` turns bold and
italic names and digits into plain ones. It leaves "…", emoji, Hindi, ①, ™
and full-width letters unchanged. Typecheck and lint pass.

#### FIX-02 · Dictated questions vanished from the Ask box — ✅ done · 2026-10-19

**The problem.** Typing a question into Ask worked, but dictating one
(Willow Voice) often put nothing in the box. Dictation apps insert text into
whatever has keyboard focus when you stop talking, and the Ask box usually
didn't have it. Opening Ask from a card left focus on the card's Ask button.
Sending by clicking the arrow or a suggestion moved focus to that button,
which goes disabled while Gemini thinks, so the browser dropped focus
entirely. Typing by hand worked only because you click into the box first.

**The change.** The Ask box takes the cursor when it appears (panel opened,
Ask tab chosen, Notebook entry opened), and again after each answer or
error, however the question was sent.

**How it works.** `useAsk` (shared by the study panel and the Notebook)
returns `inputRef`, a *stable* callback ref. It focuses the box when the box
is attached, never on later renders, so it can't pull focus back. An effect
refocuses when `pending` clears. `focusAskBox` skips touch screens (it would
pop the keyboard up), and skips when you're typing in another field (a
note, a search). It uses `preventScroll`, so the page doesn't jump.

**Key code.**
```ts
const inputRef = useCallback((el: HTMLInputElement | null) => {
  box.current = el;
  focusAskBox(el);
}, []);
useEffect(() => { if (!pending) focusAskBox(box.current); }, [pending]);
```

**Alternatives considered.** *`autoFocus` on the input* covers opening but
not "after an answer", and fires on phones. *A new callback ref each render*
would refocus on every re-render and steal focus from buttons you click.

**Files.** `components/useAsk.ts`, `components/feed/StudyPanel.tsx`,
`components/notebook/NotebookReader.tsx`.

**Verified** (local). Opening Ask from a card focuses the box (before the
fix, focus stayed on the card's Ask button). Re-asking a saved question by
*clicking* the send arrow (13 ms, the saved answer, no Gemini call) left
the cursor back in an empty box. Switching Note → Ask focuses the box, and
the Note tab still focuses the note. At 1400px the Notebook's follow-up box
is focused on open with no scroll jump. Typecheck and lint pass. Not
testable here: Willow Voice itself.

#### FIX-03 · Search: exact matches before look-alikes — ✅ done · 2026-10-19

**The problem.** Searching the feed for "redis" showed "…Parakeet Redux"
above real Redis videos. The search matches a title two ways: it
*contains* the word (`ILIKE`), or it *looks similar* (pg_trgm
`word_similarity` > 0.4, so typos like "kubernets" still work). "redis"
and "redux" share 3 of 6 trigrams, a score of 0.50, so Redux matched.
Matches were then only sorted newest first, and that Redux video was newer
than most Redis ones.

**The change.** While searching, titles that contain the words come first
and look-alikes after, each group in the view's usual order (newest
uploaded, or newest saved on Watch later). Not searching: unchanged. This
is the rule global search (⌘K) already used.

**Key code** (`app/api/videos/route.ts`).
```ts
searchOrder.push(sql`(${videos.title} ILIKE ${like}) DESC`);
// …
.orderBy(...searchOrder, later ? desc(videos.laterAt) : desc(videos.publishedAt))
```

**Alternatives considered.** *Raising the similarity bar* would drop Redux
(0.50) but also weaken typo search, and it doesn't fix the order. *A third
"whole word" group* ("Redis" above "redistribute") was skipped as rarely
needed.

**Verified** (local). redis: 2 exact, then 7 near. docker: 15, then 2
("Tracker"). kafka: 14. kubernets (typo): 22 near, all Kubernetes. In every
case all exact matches came before near ones, newest first within each.
Typecheck and lint pass.

#### FIX-04 · Audit quick wins (A1–A6) — ✅ done · 2026-10-19

Six small fixes chosen from the external performance and quality audit
(`docs/audit/AuditReport.md`). The audit labels are in brackets.

**A1 · ✓ Seen and bookmark saves could fail silently** (§5 Reliability ·
High). The toggles updated the screen at once, then sent the save with
`.catch(() => {})` and never checked the reply. Offline, a server error or
an expired login looked saved but wasn't. *Change:* `saveVideo()` returns
whether the server said OK. On failure, `show(false)` undoes exactly what
`show(true)` did (card, view totals, facets, Later counts), and on Watch
later a removed card goes back to its original spot (`restoreCard`). Then
the toast says "Couldn't save — check your connection and try again."
*Verified* with forced failures: Seen (1,010 → 1,009 → 1,010), bookmark
(Later 1 → 2 → 1), Watch-later removal (card back in place), each with the
toast. A real save round trip changed the server state and then restored it.

**A2 · Overlapping note autosaves** (§5 · High). A typing pause, blur and
close could each start a PATCH while another was in flight, so an older one
could land last and overwrite newer text. Typing then deleting during a save
was also skipped (compared against a stale "saved" value), so the deleted
text stayed. *Change:* saves are a promise queue. Each sends the text *when
its turn comes* and skips if it's already saved; the closing save queues
behind any in-flight one. No retry timer after the editor closes.
*Verified* with a 2 s first save: #2 went out only when #1 finished (2,822
ms), and the server kept the newer text. Delete-during-save: #2 sent `""`,
and the note ended `null`.

**A3 · "Up to date" hid failed channels** (§5 · Medium). The refresh message
looked only at `added`, so with failures it still said "You're up to date".
*Change:* each sync stores the failed channel titles in `app_meta`
(`last_sync_failed`, upserted with `last_sync_at` in one statement). `/api/nav`
returns `lastSyncFailed`. The message names the failed channels ("…they'll
be retried on the next sync"), and the synced dot turns `warn` amber with
the names on hover. This covers the 6-hourly sync too. Nothing was being
lost: every sync looks back 14 days, so a channel that fails once catches up
next time. *Verified* with fake YouTube replies: 2 broken channels were
recorded, and the next clean sync added their 2 missed videos and cleared
the list. In the UI the toast and amber dot appeared, and the normal state
stayed green "Synced 1d ago". The live logs showed 0 errors across 27 syncs.

**A4 · No index on `videos.channel_id`** (§4 · P2 index). *Change:*
`videos_channel_published_idx (channel_id, published_at DESC)` added to the
schema setup. *Verified* (local, 2,183 videos): a channel filter went from a
Seq Scan at 0.64 ms to an Index Scan at 0.035 ms (about 5 ms at production
size). It's created on the next cold start; setup is now 25 statements.

**A5 · Channels list read its two queries one after the other** (§4 · P1
fan-out, one piece). *Change:* `Promise.all`, one round trip fewer on Neon.
*Verified:* the reply was byte-identical to the old code's (8,348 bytes).

**A6 · Cron secret accepted in the URL** (§5 · Medium). *Change:*
`x-cron-secret` header only. *Verified:* no caller used `?secret=` (repo
grep; all 27 live `/api/cron` calls had no query string).

**Files.** `components/feed/useFeedData.ts`, `components/NoteEditor.tsx`,
`lib/ingest.ts`, `lib/nav.ts`, `components/TopBar.tsx`, `lib/db.ts`,
`app/api/channels/route.ts`, `app/api/cron/route.ts`. Typecheck and lint
pass. *Not done* (by choice, see the audit triage): B1–B5 and section C.

#### FIX-05 · Friendlier messages, no em dashes — ✅ done · 2026-10-19

**The problem.** The owner dislikes em dashes in on-screen text, and many
messages read like developer notes: "Unauthorized" (an expired login),
"videoId is required", "progress must be a string of 0s and 1s", "Sync
failed", "YouTube player API timed out".

**The change.** Every user-visible string was checked (UI text,
placeholders, the tab title, toasts, API error messages, Gemini/YouTube
errors that reach the screen). That's 43 replacements: em dashes became
commas, full stops or a colon, and terse or technical messages became plain
sentences with proper capitalisation. Examples: "Your login has expired.
Please log in again."; "That video isn't in your library anymore."; "Couldn't
check for new videos. Please try again."; "Too many attempts. Try again in 15
minutes."; tab title "TUBEBOX: your feed, no algorithm"; a channel with no
uploads shows "None yet" instead of "—"; the Notebook's Copy-as-Markdown
heading is "## Title (Channel)". Kept as they were: the instructions sent *to*
Gemini (never shown) and setup errors aimed at whoever deploys
(`GEMINI_API_KEY is not set…`).

**Verified.** No code compares message text, so the rewording can't break
logic (grep). Afterwards the only non-comment em dash left is the Gemini
prompt. The tab title shows the new text. Typecheck and lint pass.

#### FIX-06 · Gemini "busy" (503) moves to the next model — ✅ done · 2026-10-21

**The problem.** Ask failed with a 500 and showed Google's raw JSON under
the box: `{"error":{"code":503,"message":"This model is currently
experiencing high demand…","status":"UNAVAILABLE"}}`. The transcript was
fine (no transcript errors in the logs, and the later tries failed in under
2 s because it was already saved). The model chain only moved on for 429
(quota) and 404 (unknown model), so on a 503 it gave up after one model
instead of trying the others.

**The change.** A new model order, agreed with the owner from their AI
Studio limits: **3.5 Flash-Lite → 3.1 Flash-Lite → 3.8 Flash → 3.7 Flash**
(500, 500, 20 and 20 a day; the 2.5 models dropped). The order is now
**fixed** instead of "most budget left first". A busy model gets a second
try, then the next model is used. The user only ever sees a plain sentence.

**How it works.**
- `DEFAULT_CHAIN` in `lib/gemini.ts` holds the order. The code names were
  checked against Google's model list (a free call that uses no quota).
  `GEMINI_MODEL` still forces one model to the front, so it must be **unset**
  (locally and on Netlify) for 3.5 Flash-Lite to lead.
- `availableModels()` (was `rankModels()`) keeps the chain's order and only
  drops models that have used up today's budget in our `gemini_usage` ledger.
- `classifyError()` sorts each failure, by the SDK's `status` first and the
  message second:

| Kind | Errors | What happens |
|---|---|---|
| busy | 503, 500, 504, UNAVAILABLE, overloaded, network drop | one more try on the same model after 1 s, then the next model |
| skip | 429 quota, 404 unknown model, empty answer | next model at once |
| fatal | bad request, video not accessible | stop: every model would fail the same way |

- On Netlify (detected with `onNetlify()` in `lib/hosting.ts`, see PERF-06)
  no new attempt starts after 20 s, so the message arrives before
  the ~30 s cut-off. Locally there is no limit (a watch-the-video call can
  take minutes).
- Messages: all busy → "Gemini is busy right now. Please try again in a
  minute."; all out of quota → "All Gemini models have used up today's free
  budget. Please try again tomorrow."; anything else → "Gemini couldn't
  answer right now. Please try again." The video-access message for
  caption-less videos is unchanged. Raw errors go to the function log as
  `[gemini] <model> try N failed (<kind>): …`.

**Key code.**
```ts
for (const { model } of candidates) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (outOfTime()) throw new Error(BUSY_MESSAGE);
    try { /* generateContent, record usage, return */ }
    catch (err) {
      const kind = classifyError(err);
      if (kind === "fatal") throw new Error(FAILED_MESSAGE);
      if (kind === "skip") break;          // next model
      sawBusy = true;                      // busy: retry once, then next
      if (attempt === 1) await sleep(BUSY_RETRY_DELAY_MS);
    }
  }
}
```

**Alternatives considered.** *Two new env variables for the backups* (the
owner's first idea): `GEMINI_MODELS` already holds an ordered list, and a
code default means no env change at all. *Three tries per model*: with slow
replies, 3 × 4 models could pass Netlify's 30 s; one retry plus the 20 s
window keeps it safe. *Keep "most budget left first"*: it spreads use across
models, but with 500/day each and an app cap of 100 that buys nothing, and a
fixed order is easier to reason about. *3.8 Flash first* (newest, smartest):
only 20 a day, so it would run out in a day or two; better saved as a backup
(or a future "smart answer" button).

**Files.** `lib/gemini.ts`, `.env.example`, `docs/ARCHITECTURE.md`.

**Verified.** Against fake Gemini replies (the network swapped out; no real
calls): 3.5 answers first; 3.5 busy twice → 3.1 answers (1 s later); busy
once → the retry answers; 429 then 404 → 3.8 answers; all busy → 8 calls,
then the busy message (4 s); bad request → 1 call, the plain message, no
JSON; all 429 → the quota message; 3.5 at 500 in our ledger → starts at 3.1;
on Netlify with every reply slow (7 s) and busy → stops after 3 calls at
23 s with the busy message. The SDK doesn't retry on its own (call counts
matched). One real call on the owner's key confirmed `gemini-3.5-flash-lite`
answers. Typecheck and lint pass. **Still to note:** the 20 s window covers
Gemini only; a slow transcript fetch before it isn't counted, which audit B5
(one overall time limit) is meant to fix.

#### PERF-06 · Skip YouTube captions on Netlify (audit B5, step 1) — ✅ done · 2026-10-21

**The problem.** The first Ask, Summary or Transcript of a new video tries
YouTube's InnerTube caption route first. YouTube refuses that route from
cloud IPs (Netlify runs on AWS); this was found on the first deploy
(ARCHITECTURE §6) and seen again in the Apify outage, when every first Ask
failed even though InnerTube is tried before Apify. So on Netlify the try
always failed, cost a round trip, and had **no time limit**: a slow YouTube
reply could hold up the whole request. ChatGPT's audit flagged it (§4 · P1
for AI reliability).

**The change.** On Netlify the chain starts at Apify (and the Firecrawl
breaker as before). Locally InnerTube is still tried first, since it works
from home connections and is free, now with a 5 s limit on each of its two
requests.

**A bug found on the way.** The code checked `process.env.NETLIFY` to know
it was on Netlify, but Netlify's docs say `NETLIFY=true` only exists during
the **build**. Deployed functions get `SITE_ID`, `SITE_NAME` and `URL` at
runtime instead. A new `onNetlify()` helper checks `SITE_ID` (and `NETLIFY`,
for build-time code). It's used here and in FIX-06's 20 s window, which
would otherwise never have applied on the live site. The same old check
in `watchLimitMinutes()` (Gemini watching caption-less videos, meant to be
off on Netlify) is **parked by the owner**: fixing it would show the
"no captions, run it on your laptop" message on Netlify, but a very short
caption-less video might be squeezing through within 30 s today.

**Key code.**
```ts
// lib/hosting.ts
export function onNetlify(): boolean {
  return Boolean(process.env.SITE_ID || process.env.NETLIFY);
}

// lib/transcript.ts, fetchCaptions()
if (!onNetlify()) {
  const viaInnerTube = await fetchViaInnerTube(ytVideoId);
  if (viaInnerTube) return viaInnerTube;
}
```

**Alternatives considered.** *One stopwatch for the whole request* (the
rest of B5: a shared time budget so transcript + Gemini always finish before
Netlify's ~30 s): discussed and **not done**. It would only turn a rare bare
502 into a friendly message, while touching the timing of every step in 5
files; the owner judged the risk not worth it for now. Revisit if bare 502s
show up in real use. *Keep trying InnerTube in case YouTube unblocks it*:
being wrong costs about $0.005 of Apify per new video, and it's a one-line
undo.

**Files.** `lib/hosting.ts` (new), `lib/transcript.ts`, `lib/gemini.ts`.

**Verified** (fake YouTube and Apify replies; no real calls). With `SITE_ID`
set (as on Netlify): only Apify is called. Without it (local): YouTube, then
Apify. A YouTube request that never answers is dropped after 5.0 s and Apify
takes over. Typecheck and lint pass. **After deploying:** Ask on a new video
still answers (via Apify), and FIX-06's busy message arrives within ~20 s.

#### FIX-07 · Add to track: cursor, confirmation, lit icon — ✅ done · 2026-10-21

**The problem (owner, in use).** Three things about **Add to track** on a
feed card:
1. The panel opened with the cursor in the **Ask** box, not in "New track
   name". The card's track button opens the study panel on the Ask tab with
   the track chooser on top, and FIX-02's "put the cursor in the Ask box when
   it appears" (for Willow dictation) fired, because the Ask box appeared.
2. Ticking a track only changed a tick and a small count; easy to miss.
3. The card's track icon never showed that a video was already in a track.
   The feed didn't even know: `FeedVideo` had no track information.

The owner first called this "Watch later"; it is about tracks. Watch later
(the bookmark) already fills yellow when saved.

**The change.**
1. Opening the chooser (from the card or the panel's own Add to track
   button) puts the cursor in **New track name**. Opening via Ask still puts
   it in the Ask box.
2. A line under the chooser confirms each change for 4 s: "Added to AI",
   "Removed from AI", "Created Kubernetes and added this video". Inside the
   chooser rather than a toast, since the side panel can cover the toast
   area. Styling (owner asked for a stylish underline): on "Added" and
   "Created" the **track name** gets a thick (4px) straight **yellow**
   underline, yellow being the app's "on" colour, like the lit track icon.
   "Removed" has the same shape with an ✕ and a **red** underline. A quiet
   grey "Removed" was tried first; the owner found it looked weak next to
   the yellow, and chose red, accepting that red otherwise means errors in
   this design system. Blue (the pen) was declined: handwriting only.
3. The card's track icon **lights up** (like the note icon) when the video is
   in at least one track, with the hover label "In 2 tracks". Ticking or
   unticking updates the card at once.

**How it works.**
- `TrackMenu` takes `autoFocus` and focuses its name box in a `useEffect` on
  mount. Effects run after ref callbacks, so this comes after `useAsk`'s ref
  callback has focused the Ask box; and `focusAskBox()` never takes focus
  from another text field, so the Ask box's own after-answer effect leaves it
  alone too. No change to `useAsk`. Skipped on touch screens.
- `confirm(text)` sets the notice after the server accepts the change (not
  on the optimistic tick) and clears it after 4 s; `role="status"`.
- `trackCount` joins `feedVideoColumns` (`lib/videoColumns.ts`), next to
  `answerCount`: a per-row count on `track_videos`, cheap with the existing
  `track_videos_video_idx`. Every screen that sends videos (feed, single
  video, Notebook, tracks) gets it from that one list.
- `TrackMenu` reports how many of its tracks are ticked (`onInCount`) after
  every change and on first load; `StudyPanel` passes it to
  `onVideoChange`, which patches the grid card, the panel and the
  remembered feed data.

**Key code.**
```tsx
// TrackMenu
useEffect(() => {
  if (!autoFocus || window.matchMedia("(pointer: coarse)").matches) return;
  nameBox.current?.focus({ preventScroll: true });
}, [autoFocus]);
useEffect(() => {
  if (tracks) onInCountRef.current?.(tracks.filter((t) => t.contains).length);
}, [tracks]);

// VideoCard
lit={(tool === "note" && !!video.personalNote) || (tool === "track" && video.trackCount > 0)}
```

**Alternatives considered.** *A separate pop-up for adding to a track*
(without Ask/Summary below): the owner prefers keeping the panel as it is,
and it would be a new screen to maintain. *A toast for the confirmation*:
the panel can cover it. *Turning FIX-02 off while the chooser is open*:
needs `useAsk` to know about tracks; letting the chooser focus last is
simpler and keeps `useAsk` untouched. *Showing the track names on the card*:
too much on a small card; the hover label gives the count, the panel the
names.

**Files.** `components/feed/TrackMenu.tsx`, `components/feed/StudyPanel.tsx`,
`components/feed/VideoCard.tsx`, `components/types.ts`,
`lib/videoColumns.ts`.

**Verified** (local, real data, every change undone). Card → Add to track:
cursor in "New track name". Ticking "AI": "Added to AI", the card's icon
"In 1 track", AI 3 → 4; unticking: "Removed from AI", back to "Add to track"
and 3. New track "ZZ test track": "Created ZZ test track and added this
video", card lit; the test track was then deleted (tracks back to "AI 3").
Card → Ask: cursor still in the Ask box (FIX-02 intact). Feed, single video,
Notebook and track APIs all return `trackCount` (200). After a reload the one
card already in "AI" shows lit. No server errors; typecheck and lint pass.

#### FIX-08 · Dictated text sometimes didn't appear (paste race) — ✅ done · 2026-10-21

**The problem (owner, in use).** Willow Voice dictation often didn't land in
TUBEBOX's boxes, while it worked on Google and other sites. FIX-02 had made
sure the cursor was in the Ask box; this was a different fault. Recorded on
the live site with a paste logger: the Ask box landed 2 of 8 dictations, ⌘K
search 2 of 11, Notebook search 2 of 3. Every time, the page received the
paste with the right text, nothing on the page blocked it, and Chrome's
insert step got nothing (`beforeinput` with `data: null`, no `input`).

**Why.** Willow pastes by putting the words on the clipboard, pressing ⌘V,
and then putting the previous clipboard back. Chrome gives the page a
snapshot of the clipboard with the paste event; if the page doesn't use it,
Chrome reads the clipboard again to insert. When Willow's restore wins that
race, the second read finds no text. Big sites (Google) insert from the
snapshot themselves, so they never race. A control test on a blank page
proved it isn't TUBEBOX-specific: a plain input landed **1 of 4**, the same
input inserting from the snapshot **4 of 4**. (The restore is inferred from
the pattern; the fix doesn't depend on the exact cause.)

**The change.** One small component for the whole app, `PasteFix`, mounted
in the root layout beside `OfflineBar`. Any paste of plain text into a text
input or textarea is inserted from the paste event's own snapshot. After it:
⌘K **5 of 5** with Willow on localhost; the owner confirmed the other boxes.

**How it works.**
- One `paste` listener on `document` (bubble phase, so a box with its own
  paste handling, which would `preventDefault`, still wins).
- Only text inputs (`text`, `search`, `url`, `tel`, `password`) and
  textareas, not read-only or disabled ones. No plain text in the clipboard
  (an image, a file): left to the browser.
- `document.execCommand("insertText")` inserts at the cursor. It keeps ⌘Z
  working, respects `maxLength`, and fires the input events React's
  `onChange` listens to. If it's ever unavailable, `setRangeText` plus an
  `input` event does the same.
- Single-line boxes get line breaks turned into spaces, as Chrome does.

**Key code.**
```ts
let text = e.clipboardData?.getData("text/plain");
if (!text) return;
text = isInput ? text.replace(/\r?\n/g, " ") : text.replace(/\r\n/g, "\n");
e.preventDefault();
if (document.execCommand("insertText", false, text)) return;
el.setRangeText(text, start, end, "end");
el.dispatchEvent(new Event("input", { bubbles: true }));
```

**Alternatives considered.** *Calling it Willow's problem* (the first
diagnosis): true in the narrow sense, but the owner showed other sites cope,
and the fix is small. *Per-box `onPaste` handlers*: the same code in many
places, and new boxes would miss it; one listener covers every box. *Turning
off Willow's clipboard restore*: would overwrite whatever the owner had
copied, and depends on Willow's settings.

**Files.** `components/PasteFix.tsx` (new), `app/layout.tsx`.

**Verified.** Simulated pastes on localhost: the feed filter got "kafka";
the Ask box got the text, the app saw it (send button enabled), two lines
became one, ⌘Z undid it; an image paste was left alone. Real Willow on
localhost with the paste logger: ⌘K 5 of 5 (before: 2 of 11 on the live
site). The owner tested the other boxes: "Perfect works!". The note box
wasn't simulated (it autosaves into real notes); same code path. Typecheck
and lint pass.

#### FIX-09 · A sync no longer "stops" when you switch pages — ✅ done · 2026-10-22

**The problem (owner, in use).** Press sync on Podcasts, switch to the Feed,
and the sync seemed cancelled: the "Syncing" badge vanished and no result
showed.

**What the logs said.** It never was cancelled. Every sync finished on the
server (local: two `200`s in 3.1 s and 1.7 s; live: 03:24:03 in 7.5 s and
03:24:11 in 6.3 s, both `200`, the second a re-press 8 s after the first,
and the same pair the day before at 20:49 / 20:50). Each page draws its own
top bar; the new page's copy started with `syncing = false`, so the badge,
the result message and the page refresh were lost, which invited a second
(harmless but wasted) sync.

**The change.** The sync's state lives in a small module for the life of
the browser tab (`lib/syncStatus.ts`), not in the top bar. Whichever top
bar is on screen reads it (`useSyncExternalStore`): the badge stays
"Syncing" across pages, the button stays disabled (a second press starts
nothing), and when it finishes the message shows on the page you're on,
which reloads its data (`onRefreshed`). Each result is shown once
(`takeSyncResult`), so moving to another page doesn't repeat it. Still
asynchronous as before: the request runs in the background while you
browse; a full reload mid-sync loses the badge but the server still
finishes.

**Files.** `lib/syncStatus.ts` (new), `components/TopBar.tsx`.

**Verified** (local; the reply was held back 5 s in the page so the switch
happened mid-sync, the sync itself was real). Started on Podcasts:
"Syncing"; switched to the Feed: still "Syncing", button disabled; pressed
again: still one `/api/cron` request; finished: "You're up to date. Checked
16 channels, nothing new." on the Feed, which then refetched its videos,
channels and counts; back on Podcasts: no repeat. Typecheck and lint pass.

---

## Design system, Phases 1–8 (replaced by v2 in Phase 9)

Kept for the decisions that refer to it. The current values are in
[REDESIGN.md §2](REDESIGN.md).

### Colours

| Token | Value | Use |
|---|---|---|
| Background | `#fbf1dd` | Page |
| Ink | `#15130f` | Text, borders, shadows, filled/active controls |
| Primary | `#ffd02b` | The one primary action per screen, the selected sidebar row, count badges, the yellow inside icons |
| On primary | `#15130f` | Text on yellow |
| Surface | `#fffaf0` | Cards, panels, inputs |
| Panel | `#fff6de` | Top bar and feed sidebar: soft warm cream, a step warmer than the page |
| Tint 1 | `#fff3c4` / `#fff1bf` | Selected row, highlighted search match |
| Neutral 200 | `#f4e7ca` | Subtle fills, dividers |
| Neutral 300 | `#e6d5b2` | Quiet borders inside panels |
| Neutral 400 | `#cdbb96` | Disabled, placeholders |
| Muted text | `#8a7f70` / `#62594d` | Secondary text, metadata |
| Pink | `#ff9be3` | Small accents (badges, note marker) |
| Warning text | `#9a5800` | "No uploads 4 mo" and similar |

Genre colours stay **user-defined** (the genre colour picker built on
2026-10-15) — the redesign doesn't hard-code them. Text on a genre colour keeps
using `textColorFor()` so it's always readable.

### Type

| Role | Font | Notes |
|---|---|---|
| Body, buttons, inputs | Space Grotesk | Sentence case |
| Display: page titles, logo, section labels | Archivo Black | Caps allowed for short labels |
| Numbers: counts, durations, times, kbd | **Space Mono** *(new)* | So digits line up |

### Shape, borders, shadows

- **Corners: square** everywhere (no rounding).
- **Borders:** 2px ink on cards, panels, inputs and buttons; 1–2px neutral
  lines inside panels and tables.
- **Shadows (hard, no blur):** 3px on normal cards and buttons; 4–5px on the
  selected card and the primary button only.
- **Background:** cream with a faint dot grid (7% ink, the original strength;
  halving it in Phase 1 made the page feel washed out).

### Spacing

4px base scale: 4, 8, 12, 16, 24, 32.

### Icons — "sticker duotone"

Chosen 2026-10-16 over plain bold lines and 8-bit pixel icons (see UI-06).
- **One set, always drawn.** `components/ui/Icon.tsx`. Never a typed
  character (✕ ⟳ ▲▼ ✎) or an emoji (🎯 💬 📝) for a control.
- **Ink outline, 2.5px** on a 24px grid, shown at 16–17px.
- **Yellow fill only inside closed shapes** (bubble, page, star, pencil,
  copy, search lens, send). Open shapes (✕, arrows, lines, refresh) stay ink.
- **Switches don't get the fill** (the card's bookmark): a yellow bookmark
  would read as "saved". They show on/off by being filled in ink.
- **Active = filled black** (icon turns cream; the yellow stays).
- **Icon-only buttons always have an instant hover label**, placed so it's
  never cut off (below for buttons at the top of the page).

---

## Feature status at the start of the redesign

What the design shows, compared with what TUBEBOX already has.

**Already built — only the look changes:** Inbox/Later/History/Everything ·
Videos/Shorts and length filters · "124 unseen · 38h 12m" totals · progress
bars and resume · Ask, Summary, Transcript, Note · Notebook and copy ·
Tracks with Continue, Up next and autoplay · genre colours and editing ·
channel search · formatted Gemini answers.

**Built, but needs a new layout:** top bar · feed sidebar · card · study panel ·
two-pane Notebook and Tracks · Channels table (replaces Manage).

**New features:** global search · sidebar counts · Seen + Undo · Play unseen in
a row · Ask from the Notebook · track "last watched" · channel last upload and
status · bulk channel actions · everyday Ask suggestions.

---
