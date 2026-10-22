"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import FeedEmptyState from "./FeedEmptyState";
import { PAGE_SIZE, VIEW_NOTES, VIEW_TITLES, type FeedChannel, type Kind, type LengthFilter, type Study } from "./model";
import { feedPath, useFeedData } from "./useFeedData";
import { isFreshFirstScreen, markFirstScreenUsed, type FirstScreen } from "./firstScreen";
import VideoCard, { VideoCardSkeleton, type StudyTool } from "./VideoCard";
import StudyPanel from "./StudyPanel";
import ContinueStrip from "./ContinueStrip";
import FeedSidebar, { type View } from "./FeedSidebar";
import PlayerModal from "@/components/PlayerModal";
import TrackMenu from "./TrackMenu";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Spinner from "@/components/ui/Spinner";
import PageTitle from "@/components/ui/PageTitle";
import SearchField from "@/components/ui/SearchField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { FeedVideo, GenreItem } from "@/components/types";
import { formatWatchTime } from "@/lib/format";
import { api, remember, rememberedReply } from "@/lib/api-client";
import { notifyNavChanged } from "@/lib/nav-events";

/** Podcasts' "Continue listening" list. */
const CONTINUE_PATH = "/api/videos?section=podcasts&continue=1";

/** The view every page opens on, matching lib/firstScreen.ts's openingQuery. */
const OPENING_FILTERS = {
  kind: "videos" as Kind,
  view: "unwatched" as View,
  genreId: null,
  channelIds: [],
  search: "",
  lengthFilter: "any" as LengthFilter,
};

/** The channels reply, as the sidebar's channel list (with per-kind counts). */
function toFeedChannels(reply: { channels?: { channel: FeedChannel; videoCount: number; shortCount: number }[] } | undefined): FeedChannel[] {
  return (reply?.channels ?? []).map((row) => ({
    ...row.channel,
    videoCount: row.videoCount,
    shortCount: row.shortCount,
  }));
}

/**
 * The Feed, and the Podcasts page (FEAT-14): the same screen over a
 * different set of channels. Podcasts drops genres and adds "Continue
 * listening" and chapters.
 */
export default function FeedClient({
  section = "feed",
  first = null,
}: {
  section?: "feed" | "podcasts";
  /** The first screen, sent inside the page (audit B1). */
  first?: FirstScreen | null;
}) {
  const podcasts = section === "podcasts";
  // Fresh first screen: shown at once and not fetched again. A page reused
  // from the router cache carries old data, so it fetches as before.
  const [fresh] = useState(() => isFreshFirstScreen(first));
  const seed = fresh ? first : null;
  // Each starts from the copy remembered in this tab (instant when coming
  // back), then refreshes (see lib/api-client.ts).
  const [genres, setGenres] = useState<GenreItem[]>(
    () => seed?.genres.genres ?? rememberedReply("/api/genres")?.genres ?? []
  );
  const [channels, setChannels] = useState<FeedChannel[]>(() =>
    toFeedChannels(seed?.channels ?? rememberedReply("/api/channels"))
  );
  const [genreId, setGenreId] = useState<number | null>(null);
  const [channelIds, setChannelIds] = useState<number[]>([]);
  const [kind, setKind] = useState<Kind>("videos");
  const [view, setView] = useState<View>("unwatched");
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("any");
  // "Add these search results to a track" panel.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [playing, setPlaying] = useState<FeedVideo | null>(null);
  // "Play unseen in a row" (Shorts): the shorts lined up, and which is on.
  const [queue, setQueue] = useState<{ items: FeedVideo[]; index: number } | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [everyday, setEveryday] = useState<string[]>(
    () => seed?.suggestions.suggestions ?? rememberedReply("/api/ask-suggestions")?.suggestions ?? []
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Where the player starts: a chapter's second, or the resume point.
  const [playFrom, setPlayFrom] = useState<number | undefined>(undefined);
  // Podcasts: episodes started and not finished.
  const [continueList, setContinueList] = useState<FeedVideo[]>(() =>
    podcasts ? (seed?.continued?.videos ?? rememberedReply(CONTINUE_PATH)?.videos ?? []) : []
  );
  const router = useRouter();
  const searchParams = useSearchParams();

  // The videos for these filters, their counts, and the card changes that
  // keep both in step (useFeedData.ts).
  const {
    videos,
    page,
    hasMore,
    loading,
    totals,
    facets,
    laterCounts,
    filterParams,
    loadPage,
    patchVideo,
    toggleWatched,
    toggleLater,
    applyProgress,
  } = useFeedData(
    { section, kind, view, genreId, channelIds, search: debouncedSearch, lengthFilter },
    {
      firstReply: seed?.feed ?? null,
      onError: setToast,
      // The study panel holds its own copy of the video: keep it in step.
      onPatched: (id, patch) =>
        setStudy((s) => (s && s.video.id === id ? { ...s, video: { ...s.video, ...patch } } : s)),
    }
  );

  const loadChannels = useCallback(async () => {
    try {
      setChannels(toFeedChannels(await api("/api/channels")));
    } catch {}
  }, []);

  const loadContinue = useCallback(() => {
    if (!podcasts) return;
    api(CONTINUE_PATH)
      .then((d) => setContinueList(d.videos ?? []))
      .catch(() => {});
  }, [podcasts]);

  // The first screen came inside the page: keep it as this tab's remembered
  // copy (instant revisits), and don't fetch any of it again.
  useEffect(() => {
    if (!seed) return;
    remember(feedPath({ ...OPENING_FILTERS, section }, 0), seed.feed);
    remember("/api/nav", seed.nav);
    remember("/api/channels", seed.channels);
    remember("/api/genres", seed.genres);
    remember("/api/ask-suggestions", seed.suggestions);
    if (seed.continued) remember(CONTINUE_PATH, seed.continued);
    markFirstScreenUsed(seed);
  }, [seed, section]);

  useEffect(() => {
    if (!seed) loadContinue();
  }, [loadContinue, seed]);

  useEffect(() => {
    if (seed) return;
    api("/api/genres")
      .then((d) => setGenres(d.genres ?? []))
      .catch(() => {});
    api("/api/ask-suggestions")
      .then((d) => setEveryday(d.suggestions ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChannels();
  }, [loadChannels, seed]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Debounce the search box so the feed re-queries when you pause, not on
  // every keystroke (kinder to latency, and to the DB).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Esc closes the study panel — unless the player is open (Esc is its).
  useEffect(() => {
    if (!study || playing) return;
    function onKey(e: KeyboardEvent) {
      // Esc inside a text box clears or leaves the box, not the panel.
      const typing = e.target instanceof Element && e.target.closest("input, textarea");
      if (e.key === "Escape" && !typing) setStudy(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [study, playing]);

  // Links from global search land here: /?channel=5 (that channel's
  // videos), /?q=kafka (the search, across everything), /?video=42 (that
  // video in the study panel). Apply them, then tidy the address back to "/"
  // so a reload doesn't re-apply them over what you've changed since.
  useEffect(() => {
    const channel = Number(searchParams.get("channel"));
    const q = searchParams.get("q");
    const video = Number(searchParams.get("video"));
    if (!channel && !q && !video) return;
    if (channel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGenreId(null);
      setChannelIds([channel]);
      setSearch("");
      setView("all");
    }
    if (q) {
      setGenreId(null);
      setChannelIds([]);
      setSearch(q);
      setView("all");
    }
    if (video) {
      fetch(`/api/videos/${video}`)
        .then((r) => r.json())
        .then((d) => d.video && setStudy({ video: d.video, tab: "ask", track: false }))
        .catch(() => {});
    }
    router.replace(podcasts ? "/podcasts" : "/", { scroll: false });
  }, [searchParams, router, podcasts]);

  // After a sync from the top bar: new videos may have arrived, so reload
  // the first page and the channel counts.
  const reloadAfterSync = useCallback(async () => {
    await Promise.all([loadPage(0, true), loadChannels()]);
  }, [loadPage, loadChannels]);

  // Adds every video matching the current filters (all pages, not just the
  // loaded ones) to a track, oldest upload first — a series in order.
  async function addResultsToTrack(track: { id: number; name: string }) {
    setBulkBusy(true);
    try {
      const params = filterParams();
      params.set("ids", "1");
      const { ids } = await api(`/api/videos?${params}`, { fallback: "Couldn't list the results" });
      const data = await api(`/api/tracks/${track.id}/videos`, {
        method: "POST",
        body: { videoIds: ids, order: "oldest" },
        fallback: "Couldn't add to the track",
      });
      setToast(
        `Added ${data.added} video${data.added === 1 ? "" : "s"} to “${track.name}”` +
          (data.skipped > 0 ? ` (${data.skipped} already there)` : "") +
          ". Open Tracks to start."
      );
      setBulkOpen(false);
      notifyNavChanged();
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  // Stable identity, so the modal's Escape-key listener isn't re-attached on
  // every progress update.
  const closePlayer = useCallback(() => {
    setPlaying(null);
    setQueue(null);
    setPlayFrom(undefined);
    // Where you stopped changed: refresh "Continue listening".
    loadContinue();
  }, [loadContinue]);

  /**
   * Shorts' "Play unseen in a row": line up the unseen shorts on screen,
   * newest first, and play them one after another. When the line runs out
   * and there are more pages, the next page is loaded and the line grows.
   */
  function playUnseen() {
    const items = videos.filter((v) => !v.watched);
    if (items.length === 0) return;
    setQueue({ items, index: 0 });
    setPlaying(items[0]);
  }

  async function advanceQueue() {
    if (!queue) return;
    let items = queue.items;
    const index = queue.index + 1;
    if (index >= items.length && hasMore) {
      const more = await loadPage(page + 1, false);
      const known = new Set(items.map((v) => v.id));
      items = [...items, ...more.filter((v) => !v.watched && !known.has(v.id))];
    }
    if (index >= items.length) {
      setPlaying(null);
      setQueue(null);
      setToast("That's every unseen short here. Nice.");
      return;
    }
    setQueue({ items, index });
    setPlaying(items[index]);
  }

  /** A short played to the end: it's seen (the honest rule, made explicit). */
  async function queueEnded() {
    const current = queue ? videos.find((v) => v.id === queue.items[queue.index]?.id) : null;
    if (current && !current.watched) await toggleWatched(current);
    await advanceQueue();
  }

  // Opening a video doesn't mark it seen — the player reports real
  // progress, and the server marks it watched once half is actually played.
  function handlePlay(video: FeedVideo) {
    setPlayFrom(undefined);
    setPlaying(video);
  }

  /** A chapter was picked: play from its first second. */
  function playAt(video: FeedVideo, seconds: number) {
    setPlayFrom(seconds);
    setPlaying(video);
  }

  /** A card tool was clicked: open the panel there, or close it if it's already showing. */
  function openTool(video: FeedVideo, tool: StudyTool) {
    setStudy((s) => {
      const same = s?.video.id === video.id;
      if (tool === "track") {
        if (same && s.track) return { ...s, track: false };
        return { video, tab: same ? s.tab : "ask", track: true };
      }
      if (same && s.tab === tool && !s.track) return null;
      return { video, tab: tool, track: false };
    });
  }

  function genreFor(video: FeedVideo): GenreItem | undefined {
    return genres.find((g) => g.id === video.genreId);
  }

  function pickGenre(id: number | null) {
    // Genre is the outer filter; switching it resets the channel choice so
    // the feed never silently empties.
    setGenreId(id);
    setChannelIds([]);
    setFiltersOpen(false);
  }

  function toggleChannel(id: number) {
    setChannelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function clearFilters() {
    setGenreId(null);
    setChannelIds([]);
    setSearch("");
    setLengthFilter("any");
  }

  // This page's channels (Feed or Podcasts), scoped to the active genre.
  const sectionChannels = channels.filter((c) => (c.section ?? "feed") === section);
  const visibleChannels = sectionChannels.filter((c) => genreId == null || c.genreId === genreId);

  // Watch Later bookkeeping for the "hidden here" hint.
  const otherKind: Kind = kind === "videos" ? "shorts" : "videos";
  const laterHiddenByFilters =
    view === "later" && totals != null ? Math.max(0, laterCounts[kind] - totals.count) : 0;
  const laterInOtherKind = view === "later" ? laterCounts[otherKind] : 0;

  // "124 to watch in DSA · about 38 hours"
  function subtitle(): string {
    if (!totals) return "";
    const noun =
      view === "unwatched"
        ? "to watch"
        : view === "later"
          ? "saved"
          : view === "watched"
            ? "watched"
            : kind === "shorts"
              ? totals.count === 1 ? "short" : "shorts"
              : totals.count === 1 ? "video" : "videos";
    const genre = genres.find((g) => g.id === genreId);
    const scope =
      channelIds.length === 1
        ? ` from ${channels.find((c) => c.id === channelIds[0])?.title ?? "1 channel"}`
        : channelIds.length > 1
          ? ` from ${channelIds.length} channels`
          : genre
            ? ` in ${genre.name}`
            : "";
    const matching = debouncedSearch ? ` matching “${debouncedSearch}”` : "";
    return `${totals.count.toLocaleString()} ${noun}${scope}${matching} · ${formatWatchTime(totals.seconds)}`;
  }

  const gridClass =
    kind === "shorts"
      ? // Shorts: column counts (2/3/4/6) that all divide the 24-per-page
        // batch, so every page fills complete rows.
        "grid grid-cols-2 gap-5 @min-[560px]:grid-cols-3 @min-[760px]:grid-cols-4 @min-[1100px]:grid-cols-6"
      : // Columns follow the space the grid actually has (it shrinks when
        // the study panel opens), not the window size.
        "grid grid-cols-1 gap-6 @min-[460px]:grid-cols-2 @min-[680px]:grid-cols-3 @min-[920px]:grid-cols-4 @min-[1240px]:grid-cols-5 @min-[1500px]:grid-cols-6";

  const studyVideo = study ? (videos.find((v) => v.id === study.video.id) ?? study.video) : null;

  const sidebar = (
    <FeedSidebar
      view={view}
      onView={(v) => {
        setView(v);
        setFiltersOpen(false);
      }}
      genres={genres}
      genreId={genreId}
      onGenre={pickGenre}
      channels={visibleChannels.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle,
        thumbnail: c.thumbnail,
        count: kind === "videos" ? c.videoCount : c.shortCount,
      }))}
      channelIds={channelIds}
      onToggleChannel={toggleChannel}
      onClearChannels={() => setChannelIds([])}
      facets={facets}
      podcasts={podcasts}
    />
  );

  return (
    <>
      <TopBar onRefreshed={reloadAfterSync} initialNav={seed?.nav ?? null} flush />
      <div className="flex items-start">
        {/* Sidebar — wide screens: a fixed column with its own scroll. */}
        <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-[236px] shrink-0 overflow-y-auto border-r border-line py-5 lg:block">
          {sidebar}
        </aside>

        <main className="@container min-w-0 flex-1 px-4 pb-16 pt-8 sm:px-8 xl:px-10">
          {/* Title row: where you are, its pen note, and the shape-of-feed controls. */}
          <PageTitle
            title={
              kind === "shorts"
                ? "Shorts"
                : podcasts && view === "unwatched" ? "Podcasts" : VIEW_TITLES[view]
            }
            note={
              kind === "shorts"
                ? "no endless scroll here"
                : podcasts && view === "unwatched" ? "long listens, at your pace" : VIEW_NOTES[view]
            }
            summary={subtitle() || "\u00a0"}
          >
            <Button className="lg:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
              Filters
            </Button>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Filter this list"
              label="Filter this list by title"
              clearLabel="Clear filter"
              className="w-full sm:w-56"
            />
            {/* Podcasts never bring Shorts, so it's always Videos there. */}
            {!podcasts && (
              <SegmentedControl
                label="Type"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "videos", label: "Videos" },
                  { value: "shorts", label: "Shorts" },
                ]}
              />
            )}
            {kind === "videos" && (
              <SegmentedControl
                label="Video length"
                value={lengthFilter}
                onChange={setLengthFilter}
                options={
                  podcasts
                    ? [
                        { value: "any", label: "Any length" },
                        { value: "under1h", label: "Under 1h" },
                        { value: "1to2h", label: "1–2h" },
                        { value: "over2h", label: "2h+" },
                      ]
                    : [
                        { value: "any", label: "Any length" },
                        { value: "short", label: "<10m" },
                        { value: "medium", label: "10–30m" },
                        { value: "long", label: "30m+" },
                      ]
                }
              />
            )}
            {/* Shorts: watch the unseen ones back to back. */}
            {kind === "shorts" && videos.some((v) => !v.watched) && (
              <Button variant="primary" size="sm" className="h-9" onClick={playUnseen}>
                <Icon name="play" size={13} filled />
                Play unseen in a row
              </Button>
            )}
          </PageTitle>

          {/* Narrow screens: the sidebar opens here instead. */}
          {filtersOpen && (
            <div className="mb-5 rounded-lg border border-line bg-surface py-4 lg:hidden">{sidebar}</div>
          )}

          {toast && (
            <div role="status" className="mb-5 rounded-md border-[1.5px] border-ink bg-surface px-4 py-2 text-sm font-semibold">
              {toast}
            </div>
          )}

          {/* Search results can become a learning track. */}
          {debouncedSearch && totals && totals.count > 0 && (
            <div className="mb-5">
              <Button size="sm" onClick={() => setBulkOpen((o) => !o)} aria-expanded={bulkOpen}>
                <Icon name="track" size={14} />
                Add these {totals.count} to a track
              </Button>
              {bulkOpen && (
                <div className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3">
                  <p className="mb-2 text-meta font-semibold">
                    Add all {Math.min(totals.count, 300)} results for “{debouncedSearch}”, oldest
                    first, to:
                  </p>
                  {totals.count > 300 && (
                    <p className="mb-2 text-xs font-semibold text-danger">
                      That&apos;s a lot, so only the 300 oldest will be added. Narrow the
                      search for a tighter track.
                    </p>
                  )}
                  <TrackMenu mode="pick" onPick={addResultsToTrack} busy={bulkBusy} />
                  {bulkBusy && <Spinner label="Adding…" size={13} className="mt-2 text-meta font-semibold" />}
                </div>
              )}
            </div>
          )}

          {/* Watch Later hint — saved videos the current filters hide, so
              following the sidebar never "loses" anything. */}
          {(laterHiddenByFilters > 0 || laterInOtherKind > 0) && (
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold">
              {laterHiddenByFilters > 0 && (
                <span className="flex items-center gap-2">
                  {laterHiddenByFilters} more saved outside these filters
                  <Button size="sm" onClick={clearFilters}>
                    Show all
                  </Button>
                </span>
              )}
              {laterInOtherKind > 0 && (
                <span className="flex items-center gap-2">
                  {laterInOtherKind} saved in {otherKind === "shorts" ? "Shorts" : "Videos"}
                  <Button size="sm" onClick={() => setKind(otherKind)}>
                    {otherKind === "shorts" ? "Shorts" : "Videos"}
                  </Button>
                </span>
              )}
            </div>
          )}

          {/* Podcasts: where you left off, a slim sideways row above the new episodes. */}
          {podcasts && kind === "videos" && view === "unwatched" && !debouncedSearch &&
            channelIds.length === 0 && continueList.length > 0 && (
              <>
                <ContinueStrip videos={continueList} onPlay={handlePlay} />
                <h2 className="label-caps mb-3 text-muted">New episodes</h2>
              </>
            )}

          {/* Grid — placeholders while a new set loads, so the page doesn't jump. */}
          {loading === "first" ? (
            <div className={gridClass}>
              {Array.from({ length: kind === "shorts" ? 12 : 8 }, (_, i) => (
                <VideoCardSkeleton key={i} />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <FeedEmptyState
              hasChannels={sectionChannels.length > 0}
              podcasts={podcasts}
              search={debouncedSearch}
              kind={kind}
              lengthFilter={lengthFilter}
              view={view}
              onClearFilters={clearFilters}
              onClearSearch={() => setSearch("")}
              onAnyLength={() => setLengthFilter("any")}
              onSeeEverything={() => setView("all")}
            />
          ) : (
            <div className={gridClass}>
              {videos.map((video, i) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  // A row is at most 6 cards wide: the first row loads at
                  // once (it's what you see first), the rest as you scroll.
                  priority={i < 6}
                  // No genre: a plain grey tag (yellow would read as a button).
                  genreColor={genreFor(video)?.color ?? "var(--color-line)"}
                  dimSeen={view !== "watched"}
                  activeTool={
                    study?.video.id === video.id ? (study.track ? "track" : study.tab) : null
                  }
                  onPlay={handlePlay}
                  onToggleWatched={toggleWatched}
                  onToggleLater={toggleLater}
                  onOpenTool={openTool}
                />
              ))}
              {loading === "more" &&
                Array.from({ length: 4 }, (_, i) => <VideoCardSkeleton key={`more-${i}`} />)}
            </div>
          )}

          {hasMore && !loading && (
            <div className="mt-10 flex justify-center">
              <Button variant="primary" onClick={() => loadPage(page + 1, false)}>
                Load {PAGE_SIZE} more
                <Icon name="chev" size={16} />
              </Button>
            </div>
          )}
        </main>

        {/* Study panel — beside the grid on wide screens (the grid narrows
            rather than being covered); full screen on narrow ones. */}
        {study && studyVideo && (
          <div className="fixed inset-0 z-40 lg:sticky lg:top-[65px] lg:z-auto lg:h-[calc(100vh-65px)] lg:w-[460px] lg:shrink-0">
            <StudyPanel
              key={studyVideo.id}
              video={studyVideo}
              tab={study.tab}
              onTab={(tab) => setStudy((s) => (s ? { ...s, tab } : s))}
              trackOpen={study.track}
              onTrackOpen={(track) => setStudy((s) => (s ? { ...s, track } : s))}
              genrePrompt={genreFor(studyVideo)?.askPrompt ?? null}
              everyday={everyday}
              onClose={() => setStudy(null)}
              onWatch={handlePlay}
              onPlayAt={playAt}
              onVideoChange={patchVideo}
            />
          </div>
        )}
      </div>

      {playing && (
        <PlayerModal
          // A new video means a new player (fresh resume point and timers).
          key={playing.id}
          video={playing}
          startAt={playFrom}
          showChapters={playing.section === "podcasts"}
          onClose={closePlayer}
          onProgress={applyProgress}
          onEnded={queue ? queueEnded : undefined}
          queue={
            queue
              ? {
                  label: `Short ${queue.index + 1} of ${Math.max(
                    queue.items.length,
                    facets?.views.unwatched ?? 0
                  ).toLocaleString()} unseen`,
                  onNext: advanceQueue,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
