"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Mascot from "./Mascot";
import VideoCard from "./VideoCard";
import PlayerModal from "./PlayerModal";
import type { FeedVideo, GenreItem } from "./types";

type Kind = "videos" | "shorts";
type Watched = "unwatched" | "all" | "watched";

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

  const loadPage = useCallback(
    async (pageToLoad: number, replace: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          kind,
          watched,
          page: String(pageToLoad),
        });
        if (genreId != null) params.set("genreId", String(genreId));
        if (channelIds.length > 0) {
          params.set("channelIds", channelIds.join(","));
        }
        if (debouncedSearch) params.set("search", debouncedSearch);
        const res = await fetch(`/api/videos?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load feed");
        setVideos((prev) =>
          replace ? data.videos : [...prev, ...data.videos]
        );
        setHasMore(data.hasMore);
        setPage(pageToLoad);
      } catch (err) {
        setToast((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [kind, watched, genreId, channelIds, debouncedSearch]
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

  async function toggleWatched(video: FeedVideo) {
    const next = !video.watched;
    setVideos((prev) =>
      prev.map((v) => (v.id === video.id ? { ...v, watched: next } : v))
    );
    await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: next }),
    }).catch(() => {});
  }

  function handlePlay(video: FeedVideo) {
    setPlaying(video);
    if (!video.watched) toggleWatched(video);
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
                    ? { backgroundColor: genre.color, color: "var(--ink)" }
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
              ] as [Watched, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className="nb-chip rounded-full px-3 py-1 text-xs"
                data-active={watched === value}
                onClick={() => setWatched(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search — fuzzy title search, scoped to the active filters. */}
          <div className="mb-6 flex items-center gap-2">
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
          </div>

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

          {/* Grid */}
          {videos.length === 0 && !loading ? (
            <div className="nb mx-auto max-w-lg rounded-xl p-8 text-center">
              <p className="font-display text-xl">
                {debouncedSearch ? "NO MATCHES" : "NOTHING HERE YET"}
              </p>
              <p className="mt-2 text-sm text-neutral-600">
                {debouncedSearch
                  ? `No ${kind === "shorts" ? "shorts" : "videos"} match “${debouncedSearch}” in this view. Try EVERYTHING, another genre, or clear the search.`
                  : watched === "unwatched"
                    ? "Inbox zero! Switch to EVERYTHING to browse history, or add more channels."
                    : "Add your first channel and TUBEBOX will backfill its last year of uploads."}
              </p>
              {debouncedSearch ? (
                <button
                  className="nb-btn mt-4 inline-block rounded-lg px-4 py-2 text-sm"
                  onClick={() => setSearch("")}
                >
                  ✕ CLEAR SEARCH
                </button>
              ) : (
                <Link
                  href="/manage"
                  className="nb-btn mt-4 inline-block rounded-lg px-4 py-2 text-sm"
                >
                  + ADD CHANNELS
                </Link>
              )}
            </div>
          ) : (
            <div
              className={
                kind === "shorts"
                  ? "grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]"
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
        <PlayerModal video={playing} onClose={() => setPlaying(null)} />
      )}
    </div>
  );
}
