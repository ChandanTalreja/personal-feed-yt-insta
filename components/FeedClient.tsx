"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "./TopBar";
import VideoCard, { type StudyTool } from "./VideoCard";
import StudyPanel, { type StudyTab } from "./StudyPanel";
import FeedSidebar, { type Facets, type View } from "./FeedSidebar";
import PlayerModal, { type ProgressUpdate } from "./PlayerModal";
import TrackMenu from "./TrackMenu";
import Button, { buttonClass } from "./ui/Button";
import Icon from "./ui/Icon";
import Spinner from "./ui/Spinner";
import PageTitle from "./ui/PageTitle";
import SegmentedControl from "./ui/SegmentedControl";
import type { FeedVideo, GenreItem } from "./types";
import { formatWatchTime } from "@/lib/format";
import { notifyNavChanged } from "@/lib/nav-events";

type Kind = "videos" | "shorts";
type LengthFilter = "any" | "short" | "medium" | "long";

const PAGE_SIZE = 24;

const VIEW_TITLES: Record<View, string> = {
  unwatched: "Inbox",
  later: "Watch later",
  watched: "Watched",
  all: "Everything",
};

/** The blue pen note beside the title (REF-07): what makes the page different. */
const VIEW_NOTES: Record<View, string | undefined> = {
  unwatched: "newest first, no algorithm",
  later: "saved for a slower day",
  watched: "seen it, kept it",
  all: undefined,
};

interface FeedChannel {
  id: number;
  title: string;
  thumbnail: string | null;
  genreId: number | null;
  isActive: boolean;
  videoCount: number;
  shortCount: number;
}

/** What the study panel is showing: which video, which tab, track chooser open? */
interface Study {
  video: FeedVideo;
  tab: StudyTab;
  track: boolean;
}

export default function FeedClient() {
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [channels, setChannels] = useState<FeedChannel[]>([]);
  const [genreId, setGenreId] = useState<number | null>(null);
  const [channelIds, setChannelIds] = useState<number[]>([]);
  const [kind, setKind] = useState<Kind>("videos");
  const [view, setView] = useState<View>("unwatched");
  // Watch Later: total saved per kind (ignores filters → the hint below the
  // title), and how many the current filters show.
  const [laterCounts, setLaterCounts] = useState({ videos: 0, shorts: 0 });
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("any");
  // "Add these search results to a track" panel.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Count + total duration of everything the current filters match (all
  // pages, not just the loaded ones).
  const [totals, setTotals] = useState<{ count: number; seconds: number } | null>(null);
  // Sidebar counts (views and genres), from the first page's response.
  const [facets, setFacets] = useState<Facets | null>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  // "first" = the whole grid is being replaced (placeholders instead of the
  // grid); "more" = a page is being appended (placeholders after it).
  const [loading, setLoading] = useState<"first" | "more" | null>("first");
  const [toast, setToast] = useState<string | null>(null);
  const [playing, setPlaying] = useState<FeedVideo | null>(null);
  // "Play unseen in a row" (Shorts): the shorts lined up, and which is on.
  const [queue, setQueue] = useState<{ items: FeedVideo[]; index: number } | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [everyday, setEveryday] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Clicking filters quickly fires several requests; only the newest one
  // may update the screen, or a slow old answer would overwrite a new one.
  const requestId = useRef(0);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      if (!res.ok) return;
      setChannels(
        (data.channels ?? []).map(
          (row: { channel: FeedChannel; videoCount: number; shortCount: number }) => ({
            ...row.channel,
            videoCount: row.videoCount,
            shortCount: row.shortCount,
          })
        )
      );
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/genres")
      .then((r) => r.json())
      .then((d) => setGenres(d.genres ?? []))
      .catch(() => {});
    fetch("/api/ask-suggestions")
      .then((r) => r.json())
      .then((d) => setEveryday(d.suggestions ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChannels();
  }, [loadChannels]);

  // The feed's current filters as query params — shared by the page loader
  // and "add these to a track", so both always mean the same videos.
  const filterParams = useCallback(() => {
    const params = new URLSearchParams({ kind, watched: view });
    if (genreId != null) params.set("genreId", String(genreId));
    if (channelIds.length > 0) params.set("channelIds", channelIds.join(","));
    if (debouncedSearch) params.set("search", debouncedSearch);
    // Every short is under ~3 min, so the length filter only applies to
    // videos (the control is hidden on Shorts).
    if (kind === "videos" && lengthFilter !== "any") params.set("length", lengthFilter);
    return params;
  }, [kind, view, genreId, channelIds, debouncedSearch, lengthFilter]);

  const loadPage = useCallback(
    async (pageToLoad: number, replace: boolean): Promise<FeedVideo[]> => {
      const id = ++requestId.current;
      setLoading(replace ? "first" : "more");
      try {
        const params = filterParams();
        params.set("page", String(pageToLoad));
        const res = await fetch(`/api/videos?${params}`);
        const data = await res.json();
        if (id !== requestId.current) return []; // a newer request owns the screen
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the feed");
        setVideos((prev) => (replace ? data.videos : [...prev, ...data.videos]));
        setHasMore(data.hasMore);
        setPage(pageToLoad);
        if (data.laterCounts) setLaterCounts(data.laterCounts);
        if (data.totals) setTotals(data.totals);
        if (data.facets) setFacets(data.facets);
        return data.videos as FeedVideo[];
      } catch (err) {
        if (id === requestId.current) setToast((err as Error).message);
        return [];
      } finally {
        if (id === requestId.current) setLoading(null);
      }
    },
    [filterParams]
  );

  useEffect(() => {
    // Async server fetch, not a synchronous state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPage(0, true);
  }, [loadPage]);

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
    router.replace("/", { scroll: false });
  }, [searchParams, router]);

  // After a sync from the top bar: new videos may have arrived, so reload
  // the first page and the channel counts.
  const reloadAfterSync = useCallback(async () => {
    await Promise.all([loadPage(0, true), loadChannels()]);
  }, [loadPage, loadChannels]);

  // A video entered or left the current view's set: keep the count and the
  // total time in step without refetching.
  function adjustTotals(video: FeedVideo, delta: 1 | -1) {
    setTotals((t) =>
      t
        ? {
            count: Math.max(0, t.count + delta),
            seconds: Math.max(0, t.seconds + delta * video.durationSeconds),
          }
        : t
    );
  }

  /**
   * Keep the sidebar counts in step when a card changes state, without
   * refetching. `field` changed to `on` for `video`, which matches every
   * current filter (it's on screen), so only its view and genre move.
   */
  function bumpFacets(video: FeedVideo, field: "watched" | "later", on: boolean) {
    const d = on ? 1 : -1;
    setFacets((f) => {
      if (!f) return f;
      const views = { ...f.views };
      const genresCount = { ...f.genres };
      const key = String(video.genreId ?? "none");
      const bumpGenre = (n: number) => (genresCount[key] = Math.max(0, (genresCount[key] ?? 0) + n));
      if (field === "watched") {
        views.unwatched = Math.max(0, views.unwatched - d);
        views.watched += d;
        if (view === "unwatched") bumpGenre(-d);
        if (view === "watched") bumpGenre(d);
      } else {
        views.later = Math.max(0, views.later + d);
        if (view === "later") bumpGenre(d);
      }
      return { views, genres: genresCount };
    });
  }

  function adjustLaterCounts(video: FeedVideo, delta: 1 | -1) {
    const key = video.isShort ? "shorts" : "videos";
    setLaterCounts((c) => ({ ...c, [key]: Math.max(0, c[key] + delta) }));
    bumpFacets(video, "later", delta === 1);
    if (view === "later") adjustTotals(video, delta);
  }

  /** Apply a change to a video everywhere it's shown (grid and panel). */
  const patchVideo = useCallback((id: number, patch: Partial<FeedVideo>) => {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    setStudy((s) => (s && s.video.id === id ? { ...s, video: { ...s.video, ...patch } } : s));
  }, []);

  async function toggleWatched(video: FeedVideo) {
    const next = !video.watched;
    // Marking watched also takes it off Watch Later (the server does the
    // same) — and on the Later view the card leaves the list.
    const leavesLater = next && video.laterAt != null;
    if (view === "later" && leavesLater) {
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } else {
      // Everywhere else the card stays put, dimmed, with an Undo.
      patchVideo(video.id, { watched: next, laterAt: leavesLater ? null : video.laterAt });
    }
    if (leavesLater) adjustLaterCounts(video, -1);
    bumpFacets(video, "watched", next);
    // Inbox counts unwatched videos and History counts watched ones, so a
    // toggle moves the video out of (or back into) that view's total.
    if (view === "unwatched") adjustTotals(video, next ? -1 : 1);
    if (view === "watched") adjustTotals(video, next ? 1 : -1);
    await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: next }),
    }).catch(() => {});
    notifyNavChanged();
  }

  async function toggleLater(video: FeedVideo) {
    const saving = video.laterAt == null;
    if (view === "later" && !saving) {
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } else {
      patchVideo(video.id, { laterAt: saving ? new Date().toISOString() : null });
    }
    adjustLaterCounts(video, saving ? 1 : -1);
    await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ later: saving }),
    }).catch(() => {});
  }

  // Adds every video matching the current filters (all pages, not just the
  // loaded ones) to a track, oldest upload first — a series in order.
  async function addResultsToTrack(track: { id: number; name: string }) {
    setBulkBusy(true);
    try {
      const params = filterParams();
      params.set("ids", "1");
      const idsRes = await fetch(`/api/videos?${params}`);
      const { ids, error } = await idsRes.json();
      if (!idsRes.ok) throw new Error(error ?? "Couldn't list the results");
      const res = await fetch(`/api/tracks/${track.id}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: ids, order: "oldest" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't add to the track");
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
  }, []);

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
    setPlaying(video);
  }

  // A progress save came back: update the card (progress bar, resume point)
  // and, if the server just marked it watched, the counts and lists too.
  function handleProgress(update: ProgressUpdate) {
    const prev = videos.find((v) => v.id === update.id);
    const becameWatched = prev != null && !prev.watched && update.watched;
    if (becameWatched) {
      notifyNavChanged();
      bumpFacets(prev, "watched", true);
      if (prev.laterAt != null) adjustLaterCounts(prev, -1);
      if (view === "unwatched") adjustTotals(prev, -1);
      if (view === "watched") adjustTotals(prev, 1);
    }
    if (becameWatched && view === "later") {
      setVideos((list) => list.filter((v) => v.id !== update.id));
    } else {
      patchVideo(update.id, update);
    }
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

  // Channels are scoped to the active genre (the outer filter).
  const visibleChannels = channels.filter((c) => genreId == null || c.genreId === genreId);

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

  // What to say when the grid is empty — the most specific reason wins.
  function renderEmptyState() {
    let title = "Nothing here";
    let note: string | null = null;
    let body = "Nothing matches these filters.";
    let action: React.ReactNode = (
      <Button onClick={clearFilters}>Clear filters</Button>
    );
    if (channels.length === 0) {
      title = "No channels yet";
      body = "Add a channel and TUBEBOX fetches its last year of uploads.";
      action = (
        <Link href="/channels#add" className={buttonClass("primary")}>
          <Icon name="plus" size={15} />
          Add channel
        </Link>
      );
    } else if (debouncedSearch) {
      title = "No matches";
      body = `Nothing in this view matches “${debouncedSearch}”.`;
      action = <Button onClick={() => setSearch("")}>Clear search</Button>;
    } else if (kind === "videos" && lengthFilter !== "any") {
      title = "Nothing that length here";
      body = "Try another length, or any length.";
      action = <Button onClick={() => setLengthFilter("any")}>Any length</Button>;
    } else if (view === "later") {
      title = "Nothing saved for later";
      body = "Use the bookmark on any card. Watched videos leave this list on their own.";
      action = null;
    } else if (view === "unwatched") {
      title = "You're all caught up";
      note = "nothing new. go outside?";
      body = "Nothing unseen in this view.";
      action = <Button onClick={() => setView("all")}>See everything</Button>;
    } else if (view === "watched") {
      title = "Nothing watched yet";
      body = "Videos you tick, or watch past halfway, land here.";
      action = null;
    }
    return (
      <div className="mx-auto mt-6 max-w-lg rounded-lg border border-line bg-surface p-8 text-center">
        <p className="font-display text-xl">{title}</p>
        {note && <p className="pen-note mt-2">{note}</p>}
        <p className="mt-2 text-sm text-muted">{body}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
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
        thumbnail: c.thumbnail,
        count: kind === "videos" ? c.videoCount : c.shortCount,
      }))}
      channelIds={channelIds}
      onToggleChannel={toggleChannel}
      onClearChannels={() => setChannelIds([])}
      facets={facets}
    />
  );

  return (
    <>
      <TopBar onRefreshed={reloadAfterSync} flush />
      <div className="flex items-start">
        {/* Sidebar — wide screens: a fixed column with its own scroll. */}
        <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-[236px] shrink-0 overflow-y-auto border-r border-line py-5 lg:block">
          {sidebar}
        </aside>

        <main className="@container min-w-0 flex-1 px-4 pb-16 pt-8 sm:px-8 xl:px-10">
          {/* Title row: where you are, its pen note, and the shape-of-feed controls. */}
          <PageTitle
            title={kind === "shorts" ? "Shorts" : VIEW_TITLES[view]}
            note={kind === "shorts" ? "no endless scroll here" : VIEW_NOTES[view]}
            summary={subtitle() || "\u00a0"}
          >
            <Button className="lg:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
              Filters
            </Button>
            <label className="nb-input flex h-9 w-full items-center gap-2 px-3 focus-within:border-ink focus-within:shadow-[0_0_0_3px_rgb(255_208_43/0.45)] sm:w-56">
              <Icon name="search" size={15} className="text-muted" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                placeholder="Filter this list"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearch("");
                }}
                aria-label="Filter this list by title"
              />
              {search && (
                <button type="button" aria-label="Clear filter" className="text-muted hover:text-ink" onClick={() => setSearch("")}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </label>
            <SegmentedControl
              label="Type"
              value={kind}
              onChange={setKind}
              options={[
                { value: "videos", label: "Videos" },
                { value: "shorts", label: "Shorts" },
              ]}
            />
            {kind === "videos" && (
              <SegmentedControl
                label="Video length"
                value={lengthFilter}
                onChange={setLengthFilter}
                options={[
                  { value: "any", label: "Any length" },
                  { value: "short", label: "<10m" },
                  { value: "medium", label: "10–30m" },
                  { value: "long", label: "30m+" },
                ]}
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
                      That&apos;s a lot — only the 300 oldest will be added. Narrow the search
                      for a tighter track.
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

          {/* Grid — placeholders while a new set loads, so the page doesn't jump. */}
          {loading === "first" ? (
            <div className={gridClass}>
              {Array.from({ length: kind === "shorts" ? 12 : 8 }, (_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : videos.length === 0 ? (
            renderEmptyState()
          ) : (
            <div className={gridClass}>
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  genreColor={genreFor(video)?.color ?? "var(--color-primary)"}
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
                Array.from({ length: 4 }, (_, i) => <SkeletonCard key={`more-${i}`} />)}
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
          onClose={closePlayer}
          onProgress={handleProgress}
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

/** Grey stand-in card while videos load. */
function SkeletonCard() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-lg border border-line bg-surface" aria-hidden="true">
      <div className="aspect-video bg-line" />
      <div className="flex flex-col gap-2 p-3.5">
        <div className="h-3.5 w-11/12 rounded-xs bg-line" />
        <div className="h-3.5 w-2/3 rounded-xs bg-line" />
        <div className="mt-1 h-3 w-1/2 rounded-xs bg-line" />
      </div>
      <div className="h-[43px] border-t border-line" />
    </div>
  );
}
