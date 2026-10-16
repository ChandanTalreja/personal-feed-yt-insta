"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Mascot from "./Mascot";
import VideoCard from "./VideoCard";
import PlayerModal, { type ProgressUpdate } from "./PlayerModal";
import TrackMenu from "./TrackMenu";
import Emoji from "./Emoji";
import type { FeedVideo, GenreItem } from "./types";
import { textColorFor } from "@/lib/color";
import { formatTotalTime } from "@/lib/format";

type Kind = "videos" | "shorts";
type Watched = "unwatched" | "all" | "watched" | "later";
type LengthFilter = "any" | "short" | "medium" | "long";

const LENGTH_CHIPS: [LengthFilter, string][] = [
  ["any", "ANY"],
  ["short", "< 10 MIN"],
  ["medium", "10–30"],
  ["long", "30+"],
];

interface FeedChannel {
  id: number;
  title: string;
  thumbnail: string | null;
  genreId: number | null;
  isActive: boolean;
  videoCount: number;
  shortCount: number;
}

const TICKER_PHRASES = [
  "NO ALGORITHM",
  "YOUR CHANNELS ONLY",
  "STAY FOCUSED",
  "CHRONOLOGICAL & PROUD",
  "WATCH IT OR MARK IT",
  "ZERO RABBIT HOLES",
];

export default function FeedClient() {
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [channels, setChannels] = useState<FeedChannel[]>([]);
  const [genreId, setGenreId] = useState<number | null>(null);
  const [channelIds, setChannelIds] = useState<number[]>([]);
  const [kind, setKind] = useState<Kind>("videos");
  const [watched, setWatched] = useState<Watched>("unwatched");
  // Watch Later: total saved per kind (ignores filters → the tab badge), and
  // how many the current filters show (only while on LATER → the hint).
  const [laterCounts, setLaterCounts] = useState({ videos: 0, shorts: 0 });
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("any");
  // "Add these search results to a track" panel.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Count + total duration of everything the current filters match (all
  // pages, not just the loaded ones). On LATER, the count is also the number
  // of saved videos visible, which the "N more saved" hint compares against.
  const [totals, setTotals] = useState<{ count: number; seconds: number } | null>(
    null
  );
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [playing, setPlaying] = useState<FeedVideo | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [channelSearch, setChannelSearch] = useState("");

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      if (!res.ok) return;
      setChannels(
        (data.channels ?? []).map(
          (row: {
            channel: FeedChannel;
            videoCount: number;
            shortCount: number;
          }) => ({
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChannels();
  }, [loadChannels]);

  // The feed's current filters as query params — shared by the page loader
  // and "add these to a track", so both always mean the same videos.
  const filterParams = useCallback(() => {
    const params = new URLSearchParams({ kind, watched });
    if (genreId != null) params.set("genreId", String(genreId));
    if (channelIds.length > 0) {
      params.set("channelIds", channelIds.join(","));
    }
    if (debouncedSearch) params.set("search", debouncedSearch);
    // Every short is under ~3 min, so the length filter only applies to
    // VIDEOS (the chips are hidden on SHORTS).
    if (kind === "videos" && lengthFilter !== "any") {
      params.set("length", lengthFilter);
    }
    return params;
  }, [kind, watched, genreId, channelIds, debouncedSearch, lengthFilter]);

  const loadPage = useCallback(
    async (pageToLoad: number, replace: boolean) => {
      setLoading(true);
      try {
        const params = filterParams();
        params.set("page", String(pageToLoad));
        const res = await fetch(`/api/videos?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load feed");
        setVideos((prev) =>
          replace ? data.videos : [...prev, ...data.videos]
        );
        setHasMore(data.hasMore);
        setPage(pageToLoad);
        if (data.laterCounts) setLaterCounts(data.laterCounts);
        if (data.totals) setTotals(data.totals);
      } catch (err) {
        setToast((err as Error).message);
      } finally {
        setLoading(false);
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

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/cron");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      if (data.added > 0) {
        const list: { title: string; added: number }[] = data.breakdown ?? [];
        const shown = list
          .slice(0, 4)
          .map((b) => `${b.title} (${b.added})`)
          .join(", ");
        const more =
          list.length > 4 ? ` …and ${list.length - 4} more` : "";
        setToast(
          `Fetched ${data.added} new video${data.added === 1 ? "" : "s"} — ${shown}${more}.`
        );
      } else {
        setToast(
          `All caught up — ${data.channels} channels checked, nothing new.`
        );
      }
      await Promise.all([loadPage(0, true), loadChannels()]);
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

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

  // Keep the LATER badge and hint in step when a video joins or leaves the
  // list, without refetching the whole page.
  function adjustLaterCounts(video: FeedVideo, delta: 1 | -1) {
    const key = video.isShort ? "shorts" : "videos";
    setLaterCounts((c) => ({ ...c, [key]: Math.max(0, c[key] + delta) }));
    if (watched === "later") adjustTotals(video, delta);
  }

  async function toggleWatched(video: FeedVideo) {
    const next = !video.watched;
    // Marking watched also takes it off Watch Later (the server does the
    // same) — and on the LATER tab the card leaves the list.
    const leavesLater = next && video.laterAt != null;
    setVideos((prev) =>
      watched === "later" && leavesLater
        ? prev.filter((v) => v.id !== video.id)
        : prev.map((v) =>
            v.id === video.id
              ? { ...v, watched: next, laterAt: leavesLater ? null : v.laterAt }
              : v
          )
    );
    if (leavesLater) adjustLaterCounts(video, -1);
    // INBOX counts unwatched videos and HISTORY counts watched ones, so a
    // toggle moves the video out of (or back into) that tab's total.
    if (watched === "unwatched") adjustTotals(video, next ? -1 : 1);
    if (watched === "watched") adjustTotals(video, next ? 1 : -1);
    await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: next }),
    }).catch(() => {});
  }

  async function toggleLater(video: FeedVideo) {
    const saving = video.laterAt == null;
    setVideos((prev) =>
      watched === "later" && !saving
        ? prev.filter((v) => v.id !== video.id)
        : prev.map((v) =>
            v.id === video.id
              ? { ...v, laterAt: saving ? new Date().toISOString() : null }
              : v
          )
    );
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
          ". Open 🎯 TRACKS to start."
      );
      setBulkOpen(false);
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  // Stable identity, so the modal's Escape-key listener isn't re-attached on
  // every progress update.
  const closePlayer = useCallback(() => setPlaying(null), []);

  // Opening a video no longer marks it seen — the player reports real
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
      if (prev.laterAt != null) adjustLaterCounts(prev, -1);
      if (watched === "unwatched") adjustTotals(prev, -1);
      if (watched === "watched") adjustTotals(prev, 1);
    }
    setVideos((list) =>
      becameWatched && watched === "later"
        ? list.filter((v) => v.id !== update.id)
        : list.map((v) => (v.id === update.id ? { ...v, ...update } : v))
    );
  }

  function accentFor(video: FeedVideo): string {
    const genre = genres.find((g) => g.id === video.genreId);
    return genre?.color ?? "var(--yellow)";
  }

  function askPresetFor(video: FeedVideo): string | null {
    const genre = genres.find((g) => g.id === video.genreId);
    return genre?.askPrompt ?? null;
  }

  // Channels are scoped to the active genre (the outer filter); the rail's
  // search box then narrows within that scope. Both the wide-screen rail and
  // the narrow-screen chip fallback read from this same scoped list.
  const visibleChannels = channels.filter(
    (c) => genreId == null || c.genreId === genreId
  );
  const railQuery = channelSearch.trim().toLowerCase();
  const railChannels = railQuery
    ? visibleChannels.filter((c) => c.title.toLowerCase().includes(railQuery))
    : visibleChannels;

  // Watch Later bookkeeping for the tab badge and the "hidden here" hint.
  const laterTotal = laterCounts.videos + laterCounts.shorts;
  const otherKind: Kind = kind === "videos" ? "shorts" : "videos";
  const laterHiddenByFilters =
    watched === "later" && totals != null
      ? Math.max(0, laterCounts[kind] - totals.count)
      : 0;
  const laterInOtherKind = watched === "later" ? laterCounts[otherKind] : 0;

  // What to say when the grid is empty — the most specific reason wins:
  // search, then length, then the tab itself.
  function renderEmptyState() {
    const btn = "nb-btn mt-4 inline-block rounded-lg px-4 py-2 text-sm";
    const noun = kind === "shorts" ? "shorts" : "videos";
    const lengthActive = kind === "videos" && lengthFilter !== "any";
    let title = "NOTHING HERE YET";
    let body =
      "Add your first channel and TUBEBOX will backfill its last year of uploads.";
    let action: React.ReactNode = (
      <Link href="/manage" className={btn}>
        + ADD CHANNELS
      </Link>
    );
    if (debouncedSearch) {
      title = "NO MATCHES";
      body = `No ${noun} match “${debouncedSearch}” in this view. Try EVERYTHING, another genre, or clear the search.`;
      action = (
        <button className={btn} onClick={() => setSearch("")}>
          ✕ CLEAR SEARCH
        </button>
      );
    } else if (lengthActive) {
      title = "NO MATCHES";
      body = "Nothing of that length in this view.";
      action = (
        <button className={btn} onClick={() => setLengthFilter("any")}>
          ANY LENGTH
        </button>
      );
    } else if (watched === "later") {
      title = "NOTHING SAVED HERE";
      body =
        "Press + LATER on any video to save it here. Watched videos leave the list on their own.";
      action = null;
    } else if (watched === "unwatched") {
      body =
        "Inbox zero! Switch to EVERYTHING to browse history, or add more channels.";
    }
    return (
      <div className="nb mx-auto max-w-lg rounded-xl p-8 text-center">
        <p className="font-display text-xl">{title}</p>
        <p className="mt-2 text-sm text-neutral-600">{body}</p>
        {action}
      </div>
    );
  }

  function toggleChannel(id: number) {
    setChannelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-16">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-4 py-6">
        <Mascot size={72} />
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">TUBEBOX</h1>
          <p className="text-sm font-semibold text-neutral-600">
            your feed · no algorithm
          </p>
        </div>
        <div className="ml-auto flex gap-3">
          <button
            className="nb-btn rounded-lg px-4 py-2 text-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "FETCHING…" : "⟳ REFRESH"}
          </button>
          <Link
            href="/notebook"
            className="nb-btn rounded-lg px-4 py-2 text-sm"
            // Inline beats the .nb-btn yellow (a bg-* utility wouldn't).
            style={{ background: "#fff" }}
          >
            📓 NOTEBOOK
          </Link>
          <Link
            href="/tracks"
            className="nb-btn rounded-lg px-4 py-2 text-sm"
            style={{ background: "#fff" }}
          >
            🎯 TRACKS
          </Link>
          <Link
            href="/manage"
            className="nb-btn nb-btn-pink rounded-lg px-4 py-2 text-sm"
          >
            + ADD / MANAGE
          </Link>
        </div>
      </header>

      {/* Ticker */}
      <div className="nb-sm nb-ticker mb-6 overflow-hidden rounded-lg py-1.5">
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <span key={copy} className="inline-flex">
              {TICKER_PHRASES.map((phrase) => (
                <span
                  key={`${copy}-${phrase}`}
                  className="mx-6 text-xs font-bold tracking-widest"
                >
                  ◉ {phrase}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* Toast — page-level (refresh results, errors). */}
      {toast && (
        <div className="nb mb-6 rounded-lg bg-[var(--yellow)] px-4 py-2 text-sm font-bold">
          {toast}
        </div>
      )}

      {/* Two columns: a persistent channel rail (wide screens) beside the
          feed. Below `lg` the rail collapses and channels fall back to the
          wrapped chip row inside the feed column — the original layout. */}
      <div className="flex gap-6">
        {/* Channel rail — wide screens only; scoped to the active genre. */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col rounded-2xl border-[3px] border-[var(--ink)] bg-[var(--paper)] p-3 shadow-[6px_6px_0_var(--ink)]">
            <input
              className="nb-input w-full rounded-lg px-3 py-1.5 text-xs"
              placeholder="🔍 Search channels…"
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              aria-label="Search channels"
            />
            <div className="mt-3 mb-1 flex items-center justify-between px-1">
              <span className="font-display text-xs">YOUR CHANNELS</span>
              <span className="rounded-full border border-[var(--ink)] bg-[var(--yellow)] px-1.5 text-[10px] font-bold">
                {visibleChannels.length}
              </span>
            </div>
            <div className="-mr-1 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {railChannels.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-neutral-500">
                  {channelSearch
                    ? "No channels match."
                    : "No channels in this genre yet."}
                </p>
              ) : (
                railChannels.map((channel) => {
                  const selected = channelIds.includes(channel.id);
                  const count =
                    kind === "videos"
                      ? channel.videoCount
                      : channel.shortCount;
                  return (
                    <button
                      key={channel.id}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                        selected
                          ? "bg-[var(--ink)] text-[var(--paper)]"
                          : "hover:bg-black/5"
                      }`}
                      data-active={selected}
                      onClick={() => toggleChannel(channel.id)}
                      title={
                        selected
                          ? `Stop filtering by ${channel.title}`
                          : `Only show ${channel.title}`
                      }
                    >
                      {channel.thumbnail ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={channel.thumbnail}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-6 w-6 shrink-0 rounded-full border border-[var(--ink)]"
                        />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--ink)] bg-[var(--yellow)] text-[10px] font-bold text-[var(--ink)]">
                          {channel.title.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {channel.title}
                      </span>
                      {count > 0 && (
                        <span
                          className={`shrink-0 rounded-full border px-1.5 text-[10px] font-bold ${
                            selected
                              ? "border-[var(--paper)] bg-[var(--paper)] text-[var(--ink)]"
                              : "border-[var(--ink)] bg-[var(--yellow)]"
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* Feed column */}
        <main className="min-w-0 flex-1">
          {/* Genres */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 font-display text-xs text-neutral-600">
              GENRES
            </span>
            <button
              className="nb-chip rounded-full px-3 py-1 text-xs"
              data-active={genreId == null}
              onClick={() => {
                setGenreId(null);
                setChannelIds([]);
              }}
            >
              ALL
            </button>
            {genres.map((genre) => (
              <button
                key={genre.id}
                className="nb-chip rounded-full px-3 py-1 text-xs"
                style={
                  genreId === genre.id
                    ? {
                        backgroundColor: genre.color,
                        color: textColorFor(genre.color),
                      }
                    : undefined
                }
                data-active={genreId === genre.id}
                onClick={() => {
                  // Genre is the outer filter; switching it resets the
                  // channel refinement so the feed never silently empties.
                  setGenreId(genre.id);
                  setChannelIds([]);
                }}
              >
                {genre.name.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Kind + watched */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["videos", "shorts"] as Kind[]).map((k) => (
              <button
                key={k}
                className="nb-chip rounded-full px-3 py-1 text-xs"
                data-active={kind === k}
                onClick={() => setKind(k)}
              >
                {k === "videos" ? "▶ VIDEOS" : "⚡ SHORTS"}
              </button>
            ))}

            <span className="mx-1 hidden h-6 w-0.5 bg-[var(--ink)] sm:block" />

            {(
              [
                ["unwatched", "INBOX"],
                ["all", "EVERYTHING"],
                ["watched", "HISTORY"],
                ["later", "LATER"],
              ] as [Watched, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className="nb-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
                data-active={watched === value}
                onClick={() => setWatched(value)}
              >
                {label}
                {/* Total saved, whatever the filters — so nothing in Watch
                    Later is ever invisible from the tab row. */}
                {value === "later" && laterTotal > 0 && (
                  <span className="rounded-full border border-[var(--ink)] bg-[var(--yellow)] px-1.5 text-[10px] font-bold text-[var(--ink)]">
                    {laterTotal}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search — fuzzy title search, scoped to the active filters — plus
              the length filter (VIDEOS only) and the view's total time. */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <input
              className="nb-input w-full max-w-md rounded-lg px-3 py-2 text-sm"
              placeholder="🔍 Search titles… (typos OK)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search video titles"
            />
            {search && (
              <button
                className="nb-chip rounded-full px-3 py-1 text-xs"
                onClick={() => setSearch("")}
                title="Clear search"
              >
                ✕ CLEAR
              </button>
            )}
            {kind === "videos" && (
              <div className="flex flex-wrap gap-1.5 sm:ml-2">
                {LENGTH_CHIPS.map(([value, label]) => (
                  <button
                    key={value}
                    className="nb-chip rounded-full px-3 py-1 text-xs"
                    data-active={lengthFilter === value}
                    onClick={() => setLengthFilter(value)}
                    title={
                      value === "any"
                        ? "Any length"
                        : `Only videos ${label.toLowerCase()}`
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {totals && (
              <span className="ml-auto text-sm font-bold text-neutral-600">
                {totals.count}{" "}
                {kind === "shorts"
                  ? totals.count === 1
                    ? "short"
                    : "shorts"
                  : totals.count === 1
                    ? "video"
                    : "videos"}{" "}
                · {formatTotalTime(totals.seconds)}
              </span>
            )}
            {debouncedSearch && totals && totals.count > 0 && (
              <button
                className="nb-chip rounded-full px-3 py-1 text-xs"
                data-active={bulkOpen}
                onClick={() => setBulkOpen((o) => !o)}
                title="Add every result of this search to a learning track"
              >
                🎯 ADD THESE {totals.count} TO A TRACK
              </button>
            )}
          </div>

          {bulkOpen && debouncedSearch && totals && totals.count > 0 && (
            <div className="nb-sm mb-6 max-w-md rounded-lg bg-white p-3">
              <p className="mb-2 text-xs font-bold">
                Add all {Math.min(totals.count, 300)} results for “{debouncedSearch}”,
                oldest first, to:
              </p>
              {totals.count > 300 && (
                <p className="mb-2 text-[11px] font-semibold text-[var(--accent)]">
                  That&apos;s a lot — only the 300 oldest will be added. Narrow the
                  search for a tighter track.
                </p>
              )}
              <TrackMenu mode="pick" onPick={addResultsToTrack} busy={bulkBusy} />
              {bulkBusy && (
                <p className="mt-2 text-xs font-semibold">Adding…</p>
              )}
            </div>
          )}

          {/* Channel chips — narrow-screen fallback for the rail: the same
              genre-scoped multi-select, as the original wrapped row. */}
          {visibleChannels.length >= 2 && (
            <div className="mb-6 flex flex-wrap gap-2 lg:hidden">
              {visibleChannels.map((channel) => {
                const selected = channelIds.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    className="nb-chip flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs"
                    data-active={selected}
                    onClick={() => toggleChannel(channel.id)}
                    title={
                      selected
                        ? `Stop filtering by ${channel.title}`
                        : `Only show ${channel.title}`
                    }
                  >
                    {channel.thumbnail ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={channel.thumbnail}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-5 w-5 rounded-full border border-[var(--ink)]"
                      />
                    ) : (
                      <span className="h-5 w-5 rounded-full border border-[var(--ink)] bg-[var(--yellow)]" />
                    )}
                    {channel.title}
                    {(kind === "videos"
                      ? channel.videoCount
                      : channel.shortCount) > 0 && (
                      <span
                        className={`rounded-full border px-1.5 text-[10px] font-bold ${
                          selected
                            ? "border-[var(--paper)] bg-[var(--paper)] text-[var(--ink)]"
                            : "border-[var(--ink)] bg-[var(--yellow)]"
                        }`}
                      >
                        {kind === "videos"
                          ? channel.videoCount
                          : channel.shortCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Watch Later hint — saved videos the current filters hide, so
              following the genre/channel chips never "loses" anything. */}
          {(laterHiddenByFilters > 0 || laterInOtherKind > 0) && (
            <div className="nb-sm mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-[var(--paper)] px-4 py-2 text-sm font-semibold">
              {laterHiddenByFilters > 0 && (
                <span className="flex items-center gap-2">
                  {laterHiddenByFilters} more saved outside these filters
                  <button
                    className="nb-chip rounded-full px-3 py-0.5 text-xs"
                    onClick={() => {
                      setGenreId(null);
                      setChannelIds([]);
                      setSearch("");
                      setLengthFilter("any");
                    }}
                  >
                    SHOW ALL
                  </button>
                </span>
              )}
              {laterInOtherKind > 0 && (
                <span className="flex items-center gap-2">
                  {laterInOtherKind} saved in{" "}
                  {otherKind === "shorts" ? "Shorts" : "Videos"}
                  <button
                    className="nb-chip rounded-full px-3 py-0.5 text-xs"
                    onClick={() => setKind(otherKind)}
                  >
                    {otherKind === "shorts" ? "⚡ SHORTS" : "▶ VIDEOS"}
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Shorts use icon-only buttons — this is their key. */}
          {kind === "shorts" && videos.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-wide">
              <span className="text-neutral-600">ICONS:</span>
              {(
                [
                  ["✓", "SEEN"],
                  ["🕑", "LATER"],
                  ["✨", "SUMMARY"],
                  ["💬", "ASK"],
                  ["📄", "TEXT"],
                  ["📝", "NOTE (• = HAS ONE)"],
                  ["🎯", "TRACK"],
                ] as const
              ).map(([icon, label]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded border-2 border-[var(--ink)] bg-white px-2 py-0.5 text-[var(--ink)]"
                >
                  <Emoji>{icon}</Emoji>
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Grid */}
          {videos.length === 0 && !loading ? (
            renderEmptyState()
          ) : (
            <div
              className={
                // Shorts: fixed column counts (2/3/4/6) that all divide the
                // 24-per-page batch, so every page fills complete rows.
                kind === "shorts"
                  ? "grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"
                  : "grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]"
              }
            >
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  accentColor={accentFor(video)}
                  askPreset={askPresetFor(video)}
                  onPlay={handlePlay}
                  onToggleWatched={toggleWatched}
                  onToggleLater={toggleLater}
                />
              ))}
            </div>
          )}

          {loading && (
            <p className="py-8 text-center font-bold">LOADING…</p>
          )}

          {hasMore && !loading && (
            <div className="mt-8 text-center">
              <button
                className="nb-btn rounded-lg px-6 py-2"
                onClick={() => loadPage(page + 1, false)}
              >
                LOAD MORE ↓
              </button>
            </div>
          )}
        </main>
      </div>

      {playing && (
        <PlayerModal
          video={playing}
          onClose={closePlayer}
          onProgress={handleProgress}
        />
      )}
    </div>
  );
}
