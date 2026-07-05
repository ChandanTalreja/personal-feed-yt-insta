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
    [kind, watched, genreId, channelIds]
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

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16">
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

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
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

        <span className="mx-2 hidden h-6 w-0.5 bg-[var(--ink)] sm:block" />

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

        <span className="mx-2 hidden h-6 w-0.5 bg-[var(--ink)] sm:block" />

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

      {/* Channel chips — refine within the active genre; empty selection
          means the whole genre. Badge = total items stored for the active
          tab's kind (stable archive size, independent of watched state). */}
      {(() => {
        const visible = channels.filter(
          (c) => genreId == null || c.genreId === genreId
        );
        if (visible.length < 2) return null;
        return (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
            {visible.map((channel) => {
              const selected = channelIds.includes(channel.id);
              return (
                <button
                  key={channel.id}
                  className="nb-chip flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs"
                  data-active={selected}
                  onClick={() =>
                    setChannelIds((prev) =>
                      selected
                        ? prev.filter((id) => id !== channel.id)
                        : [...prev, channel.id]
                    )
                  }
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
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className="nb mb-6 rounded-lg bg-[var(--yellow)] px-4 py-2 text-sm font-bold">
          {toast}
        </div>
      )}

      {/* Grid */}
      {videos.length === 0 && !loading ? (
        <div className="nb mx-auto max-w-lg rounded-xl p-8 text-center">
          <p className="font-display text-xl">NOTHING HERE YET</p>
          <p className="mt-2 text-sm text-neutral-600">
            {watched === "unwatched"
              ? "Inbox zero! Switch to EVERYTHING to browse history, or add more channels."
              : "Add your first channel and TUBEBOX will backfill its last 6 months of uploads."}
          </p>
          <Link
            href="/manage"
            className="nb-btn mt-4 inline-block rounded-lg px-4 py-2 text-sm"
          >
            + ADD CHANNELS
          </Link>
        </div>
      ) : (
        <div
          className={
            kind === "shorts"
              ? "grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5"
              : "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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

      {playing && (
        <PlayerModal video={playing} onClose={() => setPlaying(null)} />
      )}
    </div>
  );
}
