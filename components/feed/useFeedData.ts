import { useCallback, useEffect, useRef, useState } from "react";
import type { Facets, View } from "./FeedSidebar";
import type { ProgressUpdate } from "@/components/PlayerModal";
import type { FeedVideo } from "@/components/types";
import { notifyNavChanged } from "@/lib/nav-events";
import { remember, rememberedReply, updateRemembered } from "@/lib/api-client";
import { PENDING_RESTORED, isOffline, queueVideoSave } from "@/lib/offline";
import type { Kind, LengthFilter } from "./model";

type Filters = {
  /** Feed or Podcasts: the page these videos are for (FEAT-14). */
  section: "feed" | "podcasts";
  kind: Kind;
  view: View;
  genreId: number | null;
  channelIds: number[];
  /** The (debounced) title search. */
  search: string;
  lengthFilter: LengthFilter;
};

/** The feed's filters as query params. */
function feedParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams({ kind: f.kind, watched: f.view });
  if (f.section === "podcasts") params.set("section", "podcasts");
  if (f.genreId != null) params.set("genreId", String(f.genreId));
  if (f.channelIds.length > 0) params.set("channelIds", f.channelIds.join(","));
  if (f.search) params.set("search", f.search);
  // Every short is under ~3 min, so the length filter only applies to
  // videos (the control is hidden on Shorts).
  if (f.kind === "videos" && f.lengthFilter !== "any") params.set("length", f.lengthFilter);
  return params;
}

/** One page of the feed — also the key that page is remembered under. */
export function feedPath(f: Filters, page: number): string {
  const params = feedParams(f);
  params.set("page", String(page));
  return `/api/videos?${params}`;
}

export interface FeedReply {
  videos: FeedVideo[];
  hasMore: boolean;
  laterCounts?: { videos: number; shorts: number };
  totals?: { count: number; seconds: number };
  facets?: Facets;
}

/** Apply a change to a video inside every remembered feed page too. */
function patchRemembered(id: number, patch: Partial<FeedVideo>) {
  updateRemembered<FeedReply>("/api/videos?", (reply) =>
    reply.videos ? { ...reply, videos: reply.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) } : reply
  );
}

/**
 * The feed's data, and everything that keeps it in step: the loaded pages of
 * videos for the current filters, the counts around them (sidebar facets,
 * the "N to watch · hours" totals, Watch later per kind), and the changes a
 * card makes (✓ seen, bookmark, watch progress) — applied to the grid and
 * the counts at once, without refetching, then saved.
 *
 * `onPatched` hears every change to a video, so the page can update a copy it
 * holds (the study panel's). `onError` gets a failed load's message.
 */
export function useFeedData(
  filters: Filters,
  {
    onError,
    onPatched,
    firstReply,
  }: {
    onError: (message: string) => void;
    onPatched: (id: number, patch: Partial<FeedVideo>) => void;
    /** The opening view's page, sent inside the page and fresh (audit B1):
     *  shown at once and not fetched again until a filter changes. */
    firstReply?: FeedReply | null;
  }
) {
  const { section, kind, view, genreId, channelIds, search, lengthFilter } = filters;
  // Coming back to the feed: start from the page remembered for these filters
  // (instant), while the first load below fetches a fresh one.
  const [initial] = useState(() => firstReply ?? rememberedReply<FeedReply>(feedPath(filters, 0)));
  const [firstPath] = useState(() => (firstReply ? feedPath(filters, 0) : null));
  // Set once the filters leave the opening view; from then on every view
  // (including a return to the opening one) is fetched as usual.
  const filtersChanged = useRef(false);
  // Watch Later: total saved per kind (ignores filters → the hint below the
  // title), and how many the current filters show.
  const [laterCounts, setLaterCounts] = useState(initial?.laterCounts ?? { videos: 0, shorts: 0 });
  // Count + total duration of everything the current filters match (all
  // pages, not just the loaded ones).
  const [totals, setTotals] = useState<{ count: number; seconds: number } | null>(initial?.totals ?? null);
  // Sidebar counts (views and genres), from the first page's response.
  const [facets, setFacets] = useState<Facets | null>(initial?.facets ?? null);
  const [videos, setVideos] = useState<FeedVideo[]>(initial?.videos ?? []);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false);
  // "first" = the whole grid is being replaced (placeholders instead of the
  // grid); "more" = a page is being appended (placeholders after it).
  const [loading, setLoading] = useState<"first" | "more" | null>(initial ? null : "first");
  // Clicking filters quickly fires several requests; only the newest one
  // may update the screen, or a slow old answer would overwrite a new one.
  const requestId = useRef(0);
  // The latest callbacks, without making loadPage or patchVideo change identity.
  const onErrorRef = useRef(onError);
  const onPatchedRef = useRef(onPatched);
  useEffect(() => {
    onErrorRef.current = onError;
    onPatchedRef.current = onPatched;
  });

  // The feed's current filters as query params — shared by the page loader
  // and "add these to a track", so both always mean the same videos.
  const filterParams = useCallback(
    () => feedParams({ section, kind, view, genreId, channelIds, search, lengthFilter }),
    [section, kind, view, genreId, channelIds, search, lengthFilter]
  );

  const loadPage = useCallback(
    async (pageToLoad: number, replace: boolean): Promise<FeedVideo[]> => {
      const id = ++requestId.current;
      const path = feedPath({ section, kind, view, genreId, channelIds, search, lengthFilter }, pageToLoad);
      const show = (data: FeedReply) => {
        setVideos((prev) => (replace ? data.videos : [...prev, ...data.videos]));
        setHasMore(data.hasMore);
        setPage(pageToLoad);
        if (data.laterCounts) setLaterCounts(data.laterCounts);
        if (data.totals) setTotals(data.totals);
        if (data.facets) setFacets(data.facets);
      };
      // A first page seen before in this tab shows at once (no placeholders);
      // the fresh one replaces it when it arrives.
      const seen = replace && pageToLoad === 0 ? rememberedReply<FeedReply>(path) : undefined;
      if (seen) show(seen);
      setLoading(seen ? null : replace ? "first" : "more");
      try {
        const res = await fetch(path);
        const data = await res.json();
        if (res.ok && pageToLoad === 0) remember(path, data);
        if (id !== requestId.current) return []; // a newer request owns the screen
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the feed");
        show(data);
        return data.videos as FeedVideo[];
      } catch (err) {
        if (id === requestId.current) onErrorRef.current((err as Error).message);
        return [];
      } finally {
        if (id === requestId.current) setLoading(null);
      }
    },
    [section, kind, view, genreId, channelIds, search, lengthFilter]
  );

  useEffect(() => {
    const path = feedPath({ section, kind, view, genreId, channelIds, search, lengthFilter }, 0);
    const skip = !filtersChanged.current && path === firstPath;
    if (!skip) {
      filtersChanged.current = true;
      loadPage(0, true);
    }
    // Changes left waiting from before a reload were just saved: this page
    // loaded without them, so load it again.
    const onRestored = () => loadPage(0, true);
    window.addEventListener(PENDING_RESTORED, onRestored);
    return () => window.removeEventListener(PENDING_RESTORED, onRestored);
  }, [loadPage, firstPath, section, kind, view, genreId, channelIds, search, lengthFilter]);

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
    patchRemembered(id, patch);
    onPatchedRef.current(id, patch);
  }, []);

  // ✓ seen and the bookmark change the screen at once, then save.
  // - No connection: the change stays and waits in lib/offline.ts's list,
  //   saving by itself when the connection is back (the offline bar says so).
  // - The server refused (logged out, server error): waiting won't help, so
  //   put the card and every count back as they were, and say so.
  async function saveVideo(
    id: number,
    field: "watched" | "later",
    value: boolean
  ): Promise<"saved" | "queued" | "refused"> {
    const queue = () => {
      queueVideoSave(id, field, value);
      return "queued" as const;
    };
    if (isOffline()) return queue();
    try {
      const res = await fetch(`/api/videos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      return res.ok ? "saved" : "refused";
    } catch {
      return queue(); // the request never reached the server
    }
  }

  /** Put a card that left the list back where it was (a failed save). */
  function restoreCard(video: FeedVideo, at: number) {
    setVideos((prev) => {
      if (prev.some((v) => v.id === video.id)) return prev;
      const next = [...prev];
      next.splice(Math.max(0, Math.min(at, next.length)), 0, video);
      return next;
    });
    patchRemembered(video.id, { watched: video.watched, laterAt: video.laterAt });
  }

  const NOT_SAVED = "Couldn't save. Please try again.";

  async function toggleWatched(video: FeedVideo) {
    const next = !video.watched;
    // Marking watched also takes it off Watch Later (the server does the
    // same) — and on the Later view the card leaves the list.
    const leavesLater = next && video.laterAt != null;
    const leavesList = view === "later" && leavesLater;
    const at = videos.findIndex((v) => v.id === video.id);
    // `on`: apply the change; off: undo it after a failed save.
    const show = (on: boolean) => {
      if (leavesList) {
        if (on) {
          setVideos((prev) => prev.filter((v) => v.id !== video.id));
          patchRemembered(video.id, { watched: next, laterAt: null });
        } else {
          restoreCard(video, at);
        }
      } else {
        // Everywhere else the card stays put, dimmed, with an Undo.
        patchVideo(
          video.id,
          on
            ? { watched: next, laterAt: leavesLater ? null : video.laterAt }
            : { watched: video.watched, laterAt: video.laterAt }
        );
      }
      if (leavesLater) adjustLaterCounts(video, on ? -1 : 1);
      bumpFacets(video, "watched", on ? next : !next);
      // Inbox counts unwatched videos and History counts watched ones, so a
      // toggle moves the video out of (or back into) that view's total.
      // (It ends up watched when the change is applied and `next` is
      // watched, or undone and `next` was unwatched.)
      const endsWatched = on === next;
      if (view === "unwatched") adjustTotals(video, endsWatched ? -1 : 1);
      if (view === "watched") adjustTotals(video, endsWatched ? 1 : -1);
    };
    show(true);
    const result = await saveVideo(video.id, "watched", next);
    if (result === "saved") notifyNavChanged();
    if (result === "refused") {
      show(false);
      onErrorRef.current(NOT_SAVED);
    }
  }

  async function toggleLater(video: FeedVideo) {
    const saving = video.laterAt == null;
    const leavesList = view === "later" && !saving;
    const at = videos.findIndex((v) => v.id === video.id);
    const show = (on: boolean) => {
      if (leavesList) {
        if (on) {
          setVideos((prev) => prev.filter((v) => v.id !== video.id));
          patchRemembered(video.id, { laterAt: null });
        } else {
          restoreCard(video, at);
        }
      } else {
        patchVideo(video.id, {
          laterAt: on ? (saving ? new Date().toISOString() : null) : video.laterAt,
        });
      }
      adjustLaterCounts(video, saving === on ? 1 : -1);
    };
    show(true);
    if ((await saveVideo(video.id, "later", saving)) === "refused") {
      show(false);
      onErrorRef.current(NOT_SAVED);
    }
  }

  // A progress save came back: update the card (progress bar, resume point)
  // and, if the server just marked it watched, the counts and lists too.
  function applyProgress(update: ProgressUpdate) {
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
      patchRemembered(update.id, update);
    } else {
      patchVideo(update.id, update);
    }
  }

  return {
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
  };
}
