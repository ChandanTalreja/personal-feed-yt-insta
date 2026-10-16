"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Mascot from "./Mascot";
import PlayerModal, { type ProgressUpdate } from "./PlayerModal";
import { formatDuration, formatTotalTime } from "@/lib/format";
import { coveredRatio } from "@/lib/progress";
import type { FeedVideo } from "./types";

interface TrackSummary {
  id: number;
  name: string;
  count: number;
  watchedCount: number;
  totalSeconds: number;
  remainingSeconds: number;
  nextVideoId: number | null;
}

type TrackVideo = FeedVideo & { position: number };

interface TrackDetail {
  track: { id: number; name: string };
  videos: TrackVideo[];
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[var(--ink)] bg-white">
      <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function statsLine(t: TrackSummary): string {
  if (t.count === 0) return "Empty — add videos from the feed with 🎯 TRACK";
  if (t.watchedCount === t.count) return `All ${t.count} watched ✓`;
  return `${t.watchedCount} of ${t.count} watched · ${formatTotalTime(
    t.remainingSeconds
  )} left`;
}

export default function TracksClient() {
  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<TrackVideo | null>(null);

  const loadTracks = useCallback(async () => {
    const res = await fetch("/api/tracks");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't load tracks");
    setTracks(data.tracks);
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const res = await fetch(`/api/tracks/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't load the track");
    setDetail(data);
    return data as TrackDetail;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTracks().catch((err) => setError((err as Error).message));
  }, [loadTracks]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong");
    return data;
  }

  const createTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      await api("POST", "/api/tracks", { name: newName });
      setNewName("");
      await loadTracks();
    });
  };

  const openTrack = (id: number) => run(async () => void (await loadDetail(id)));

  const backToList = () =>
    run(async () => {
      setDetail(null);
      setRenaming(null);
      await loadTracks();
    });

  const move = (video: TrackVideo, direction: "up" | "down") =>
    detail &&
    run(async () => {
      await api("POST", `/api/tracks/${detail.track.id}/move`, {
        videoId: video.id,
        direction,
      });
      await loadDetail(detail.track.id);
    });

  const remove = (video: TrackVideo) =>
    detail &&
    run(async () => {
      await api(
        "DELETE",
        `/api/tracks/${detail.track.id}/videos?videoId=${video.id}`
      );
      await loadDetail(detail.track.id);
    });

  const saveRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || renaming == null) return;
    run(async () => {
      const { track } = await api("PATCH", `/api/tracks/${detail.track.id}`, {
        name: renaming,
      });
      setDetail({ ...detail, track });
      setRenaming(null);
    });
  };

  const deleteTrack = () =>
    detail &&
    confirm(
      `Delete the track "${detail.track.name}"? The videos stay in your feed.`
    ) &&
    run(async () => {
      await api("DELETE", `/api/tracks/${detail.track.id}`);
      setDetail(null);
      await loadTracks();
    });

  // CONTINUE: the first unwatched video in order (it resumes where you left
  // off — that part is the player's job). From the list, load the track first.
  const continueTrack = (id: number) =>
    run(async () => {
      const d = detail?.track.id === id ? detail : await loadDetail(id);
      const next = d.videos.find((v) => !v.watched) ?? null;
      if (next) setPlaying(next);
    });

  // Autoplay: when a video started from this page ends, play the next one
  // in the track. (Only here — the normal feed never auto-advances.)
  function playNext() {
    if (!detail || !playing) return;
    const i = detail.videos.findIndex((v) => v.id === playing.id);
    const next = detail.videos[i + 1];
    if (next) setPlaying(next);
    else setPlaying(null);
  }

  function handleProgress(update: ProgressUpdate) {
    setDetail((d) =>
      d
        ? {
            ...d,
            videos: d.videos.map((v) =>
              v.id === update.id ? { ...v, ...update } : v
            ),
          }
        : d
    );
  }

  const closePlayer = useCallback(() => {
    setPlaying(null);
    // Refresh the stats (watched counts, time left) after a session.
    loadTracks().catch(() => {});
  }, [loadTracks]);

  const detailSummary: TrackSummary | null = detail
    ? {
        id: detail.track.id,
        name: detail.track.name,
        count: detail.videos.length,
        watchedCount: detail.videos.filter((v) => v.watched).length,
        totalSeconds: detail.videos.reduce((s, v) => s + v.durationSeconds, 0),
        remainingSeconds: detail.videos
          .filter((v) => !v.watched)
          .reduce(
            (s, v) =>
              s +
              v.durationSeconds *
                (1 - coveredRatio(v.watchProgress, v.durationSeconds)),
            0
          ),
        nextVideoId: detail.videos.find((v) => !v.watched)?.id ?? null,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16">
      <header className="flex flex-wrap items-center gap-4 py-6">
        <Mascot size={64} />
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">TRACKS</h1>
          <p className="text-sm font-semibold text-neutral-600">
            what you chose to learn, in order
          </p>
        </div>
        <Link href="/" className="nb-btn ml-auto rounded-lg px-4 py-2 text-sm">
          ← BACK TO FEED
        </Link>
      </header>

      {error && (
        <div className="nb mb-6 rounded-lg bg-[var(--yellow)] px-4 py-2 text-sm font-bold">
          {error}
        </div>
      )}

      {/* ---------- List of tracks ---------- */}
      {!detail && (
        <>
          <form onSubmit={createTrack} className="mb-6 flex flex-wrap gap-2">
            <input
              className="nb-input w-full max-w-sm rounded-lg px-3 py-2 text-sm"
              placeholder="New track, e.g. Kubernetes"
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="New track name"
            />
            <button
              type="submit"
              className="nb-btn rounded-lg px-4 py-2 text-sm"
              disabled={busy || !newName.trim()}
            >
              + NEW TRACK
            </button>
          </form>

          {tracks == null && !error && (
            <p className="py-8 text-center font-bold">LOADING…</p>
          )}

          {tracks?.length === 0 && (
            <div className="nb mx-auto max-w-lg rounded-xl p-8 text-center">
              <p className="font-display text-xl">NO TRACKS YET</p>
              <p className="mt-2 text-sm text-neutral-600">
                Name one above, then add videos from the feed: 🎯 TRACK on any
                card, or search a topic and “add these results to a track”.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {tracks?.map((t) => (
              <section key={t.id} className="nb rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="font-display flex-1 text-left text-lg hover:underline"
                    onClick={() => openTrack(t.id)}
                  >
                    {t.name}
                  </button>
                  {t.nextVideoId != null && (
                    <button
                      className="nb-btn rounded-lg px-3 py-1.5 text-xs"
                      disabled={busy}
                      onClick={() => continueTrack(t.id)}
                    >
                      ▶ CONTINUE
                    </button>
                  )}
                  <button
                    className="nb-chip rounded px-3 py-1.5 text-xs"
                    onClick={() => openTrack(t.id)}
                  >
                    OPEN
                  </button>
                </div>
                {t.count > 0 && (
                  <div className="mt-3">
                    <ProgressBar done={t.watchedCount} total={t.count} />
                  </div>
                )}
                <p className="mt-2 text-xs font-semibold text-neutral-600">
                  {statsLine(t)}
                </p>
              </section>
            ))}
          </div>
        </>
      )}

      {/* ---------- One track ---------- */}
      {detail && detailSummary && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              className="nb-chip rounded px-3 py-1 text-xs"
              onClick={backToList}
            >
              ← ALL TRACKS
            </button>
          </div>

          <section className="nb mb-5 rounded-xl p-4">
            {renaming == null ? (
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display flex-1 text-xl">
                  {detail.track.name}
                </h2>
                {detailSummary.nextVideoId != null && (
                  <button
                    className="nb-btn rounded-lg px-3 py-1.5 text-xs"
                    disabled={busy}
                    onClick={() => continueTrack(detail.track.id)}
                  >
                    ▶ CONTINUE
                  </button>
                )}
                <button
                  className="nb-chip rounded px-2.5 py-1.5 text-xs"
                  onClick={() => setRenaming(detail.track.name)}
                >
                  ✎ RENAME
                </button>
                <button
                  className="nb-chip nb-danger rounded px-2.5 py-1.5 text-xs"
                  onClick={deleteTrack}
                >
                  DELETE
                </button>
              </div>
            ) : (
              <form onSubmit={saveRename} className="flex flex-wrap gap-2">
                <input
                  className="nb-input min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm"
                  value={renaming}
                  maxLength={60}
                  autoFocus
                  // Select the current name so typing replaces it.
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setRenaming(e.target.value)}
                  aria-label="Track name"
                />
                <button type="submit" className="nb-btn rounded-lg px-3 py-1.5 text-xs">
                  SAVE
                </button>
                <button
                  type="button"
                  className="nb-chip rounded-lg px-3 py-1.5 text-xs"
                  onClick={() => setRenaming(null)}
                >
                  CANCEL
                </button>
              </form>
            )}
            {detailSummary.count > 0 && (
              <div className="mt-3">
                <ProgressBar
                  done={detailSummary.watchedCount}
                  total={detailSummary.count}
                />
              </div>
            )}
            <p className="mt-2 text-xs font-semibold text-neutral-600">
              {statsLine(detailSummary)}
              {detailSummary.count > 0 &&
                ` · ${formatTotalTime(detailSummary.totalSeconds)} in total`}
            </p>
          </section>

          <ol className="flex flex-col gap-3">
            {detail.videos.map((v, i) => {
              const pct = Math.round(
                coveredRatio(v.watchProgress, v.durationSeconds) * 100
              );
              const isNext = v.id === detailSummary.nextVideoId;
              return (
                <li
                  key={v.id}
                  className={`nb flex flex-wrap items-center gap-3 rounded-xl p-3 ${
                    v.watched ? "opacity-60" : ""
                  }`}
                >
                  <span className="font-display w-7 text-center text-lg">
                    {i + 1}
                  </span>
                  <button
                    className="relative w-32 shrink-0 overflow-hidden rounded-md border-2 border-[var(--ink)] bg-black"
                    onClick={() => setPlaying(v)}
                    aria-label={`Play ${v.title}`}
                  >
                    {v.thumbnail ? (
                      <img
                        src={v.thumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="aspect-video w-full bg-neutral-800" />
                    )}
                    {pct > 0 && (
                      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
                        <span
                          className="block h-full bg-[var(--accent)]"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    )}
                  </button>
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-bold leading-snug">{v.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {v.channelTitle}
                      {v.durationSeconds > 0 &&
                        ` · ${formatDuration(v.durationSeconds)}`}
                      {v.watched
                        ? " · ✓ watched"
                        : pct > 0
                          ? ` · ${pct}% watched`
                          : ""}
                      {isNext && (
                        <span className="ml-1.5 rounded-full border border-[var(--ink)] bg-[var(--yellow)] px-1.5 text-[10px] font-bold text-[var(--ink)]">
                          UP NEXT
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className="nb-chip rounded px-2 py-1 text-xs"
                      onClick={() => setPlaying(v)}
                      title="Play"
                    >
                      ▶
                    </button>
                    <button
                      className="nb-chip rounded px-2 py-1 text-xs"
                      disabled={busy || i === 0}
                      onClick={() => move(v, "up")}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      className="nb-chip rounded px-2 py-1 text-xs"
                      disabled={busy || i === detail.videos.length - 1}
                      onClick={() => move(v, "down")}
                      title="Move down"
                    >
                      ▼
                    </button>
                    <button
                      className="nb-chip rounded px-2 py-1 text-xs"
                      disabled={busy}
                      onClick={() => remove(v)}
                      title="Remove from this track"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          {detail.videos.length === 0 && (
            <div className="nb mx-auto max-w-lg rounded-xl p-8 text-center">
              <p className="font-display text-xl">EMPTY TRACK</p>
              <p className="mt-2 text-sm text-neutral-600">
                Add videos from the feed: 🎯 TRACK on any card, or search a
                topic and “add these results to a track”.
              </p>
            </div>
          )}
        </>
      )}

      {playing && (
        <PlayerModal
          key={playing.id}
          video={playing}
          onClose={closePlayer}
          onProgress={handleProgress}
          onEnded={playNext}
        />
      )}
    </div>
  );
}
