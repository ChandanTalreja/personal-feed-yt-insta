"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./TopBar";
import PlayerModal, { type ProgressUpdate } from "./PlayerModal";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import Icon from "./ui/Icon";
import { formatDuration, formatTotalTime, timeAgo } from "@/lib/format";
import { coveredRatio } from "@/lib/progress";
import { notifyNavChanged } from "@/lib/nav-events";
import type { FeedVideo, GenreItem } from "./types";

interface TrackSummary {
  id: number;
  name: string;
  createdAt: string;
  count: number;
  watchedCount: number;
  totalSeconds: number;
  remainingSeconds: number;
  nextVideoId: number | null;
  lastPlayedAt: string | null;
  genreId: number | null;
}

type TrackVideo = FeedVideo & { position: number };

interface TrackDetail {
  track: { id: number; name: string };
  videos: TrackVideo[];
}

/** Above this many videos the block bar would be slivers; a plain bar reads better. */
const MAX_BLOCKS = 60;

/** "today", "yesterday", "3d ago", "2w ago". */
function lastWatchedLabel(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(then.toDateString()).getTime()) / 86_400_000
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return timeAgo(iso);
}

/** The line under a track's name: what's left and when you were last here. */
function trackLine(t: TrackSummary): string {
  if (t.count === 0) return "Empty: add videos from the feed";
  const left = t.watchedCount === t.count ? "All watched ✓" : `${formatTotalTime(t.remainingSeconds)} left`;
  return t.lastPlayedAt ? `${left} · last watched ${lastWatchedLabel(t.lastPlayedAt)}` : left;
}

/**
 * Learning tracks: your tracks on the left (progress, time left, last
 * watched); the chosen one on the right as a path — a block per video, the
 * next step with Continue, and the full list in order.
 */
export default function TracksClient() {
  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<TrackVideo | null>(null);
  // Phones show the list or one track, not both.
  const [reading, setReading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadTracks = useCallback(async () => {
    const res = await fetch("/api/tracks");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't load tracks");
    // The tracks you're working on first: most recently watched, then newest.
    const list: TrackSummary[] = [...data.tracks].sort((a, b) =>
      (b.lastPlayedAt ?? b.createdAt).localeCompare(a.lastPlayedAt ?? a.createdAt)
    );
    setTracks(list);
    return list;
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const res = await fetch(`/api/tracks/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't load the track");
    setDetail(data);
    return data as TrackDetail;
  }, []);

  useEffect(() => {
    fetch("/api/genres")
      .then((r) => r.json())
      .then((d) => setGenres(d.genres ?? []))
      .catch(() => {});
    // Async server fetch, not a synchronous state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTracks()
      .then((list) => {
        // /tracks?t=5 opens that track; otherwise the most active one.
        const wanted = Number(new URLSearchParams(window.location.search).get("t"));
        const pick = list.find((t) => t.id === wanted) ?? list[0];
        if (pick) {
          setSelectedId(pick.id);
          if (wanted) setReading(true);
          return loadDetail(pick.id);
        }
      })
      .catch((err) => setError((err as Error).message));
  }, [loadTracks, loadDetail]);

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
    notifyNavChanged();
    return data;
  }

  function select(id: number) {
    setSelectedId(id);
    setReading(true);
    setRenaming(null);
    setConfirmDelete(false);
    window.history.replaceState(null, "", `/tracks?t=${id}`);
    if (window.innerWidth < 1024) window.scrollTo({ top: 0 });
    run(async () => void (await loadDetail(id)));
  }

  const createTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      const { track } = await api("POST", "/api/tracks", { name: newName });
      setNewName("");
      setCreating(false);
      await loadTracks();
      select(track.id);
    });
  };

  const saveRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || renaming == null) return;
    run(async () => {
      const { track } = await api("PATCH", `/api/tracks/${detail.track.id}`, { name: renaming });
      setDetail({ ...detail, track });
      setRenaming(null);
      await loadTracks();
    });
  };

  const deleteTrack = () =>
    detail &&
    run(async () => {
      await api("DELETE", `/api/tracks/${detail.track.id}`);
      setConfirmDelete(false);
      setDetail(null);
      const list = await loadTracks();
      if (list[0]) select(list[0].id);
      else {
        setSelectedId(null);
        window.history.replaceState(null, "", "/tracks");
      }
    });

  const move = (video: TrackVideo, direction: "up" | "down") =>
    detail &&
    run(async () => {
      await api("POST", `/api/tracks/${detail.track.id}/move`, { videoId: video.id, direction });
      await loadDetail(detail.track.id);
    });

  const remove = (video: TrackVideo) =>
    detail &&
    run(async () => {
      await api("DELETE", `/api/tracks/${detail.track.id}/videos?videoId=${video.id}`);
      await Promise.all([loadDetail(detail.track.id), loadTracks()]);
    });

  // Autoplay: when a video started from this page ends, play the next one
  // in the track. (Only here — the feed never auto-advances.)
  function playNext() {
    if (!detail || !playing) return;
    const i = detail.videos.findIndex((v) => v.id === playing.id);
    setPlaying(detail.videos[i + 1] ?? null);
  }

  function handleProgress(update: ProgressUpdate) {
    setDetail((d) =>
      d ? { ...d, videos: d.videos.map((v) => (v.id === update.id ? { ...v, ...update } : v)) } : d
    );
  }

  const closePlayer = useCallback(() => {
    setPlaying(null);
    // Refresh the stats (watched, time left, last watched) after a session —
    // and the Feed tab's unwatched count, which the session may have changed.
    loadTracks().catch(() => {});
    notifyNavChanged();
  }, [loadTracks]);

  const summary = tracks?.find((t) => t.id === selectedId) ?? null;
  const genreOf = (id: number | null) => genres.find((g) => g.id === id) ?? null;

  // ---------- Layout ----------

  const list = (
    <aside className="flex w-full flex-col border-ink lg:sticky lg:top-[58px] lg:h-[calc(100vh-58px)] lg:w-[380px] lg:shrink-0 lg:border-r-2">
      <div className="flex flex-col gap-3 border-b-2 border-ink bg-panel p-5">
        <div className="flex items-end justify-between gap-3">
          <h1 className="font-display text-[30px] leading-none">Tracks</h1>
          <Button size="sm" onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
            <Icon name="plus" size={13} strokeWidth={3} />
            New track
          </Button>
        </div>
        {creating && (
          <form onSubmit={createTrack} className="flex gap-2">
            <input
              className="nb-input min-w-0 flex-1 px-2.5 py-1.5 text-sm"
              placeholder="Track name, e.g. Kubernetes"
              value={newName}
              maxLength={60}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
              aria-label="New track name"
            />
            <Button type="submit" size="sm" variant="primary" disabled={busy || !newName.trim()}>
              Create
            </Button>
          </form>
        )}
      </div>

      {tracks == null && !error && <p className="p-6 text-sm font-bold text-muted-2">Loading tracks…</p>}
      {tracks?.length === 0 && (
        <div className="p-6 text-sm text-ink/75">
          <p className="font-display text-lg text-ink">Start your first track</p>
          <p className="mt-1">
            A track is a list of videos to learn in order. Create one here, then add videos from
            the feed: the track button on any card, or search a topic and add all the results.
          </p>
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {tracks?.map((t) => {
          const on = t.id === selectedId;
          const g = genreOf(t.genreId);
          const pct = t.count ? Math.round((t.watchedCount / t.count) * 100) : 0;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => select(t.id)}
                aria-current={on ? "true" : undefined}
                className={`flex w-full flex-col gap-2.5 border-b-2 border-l-[5px] border-b-line-2 px-5 py-4 text-left ${
                  on ? "border-l-primary bg-tint" : "border-l-transparent hover:bg-cream"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 border-[1.5px] border-ink"
                    style={{ backgroundColor: g?.color ?? "transparent" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{t.name}</span>
                  <span className="font-mono text-[12.5px] font-bold">
                    {t.watchedCount}/{t.count}
                  </span>
                </span>
                <span className="block h-2 border-2 border-ink bg-surface">
                  <span className="block h-full bg-ink" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-xs text-ink/75">{trackLine(t)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );

  return (
    <>
      <TopBar flush />
      {error && (
        <div className="mx-4 mt-4 border-2 border-ink bg-primary px-4 py-2 text-sm font-bold shadow-hard">{error}</div>
      )}
      <div className="flex flex-col lg:flex-row lg:items-start">
        {/* Wide screens: the wrapper vanishes so the list can stay put (sticky). */}
        <div className={`${reading ? "hidden" : "block"} lg:contents`}>{list}</div>

        <main className={`${reading ? "block" : "hidden lg:block"} min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-7`}>
          <button
            type="button"
            onClick={() => setReading(false)}
            className="mb-4 flex items-center gap-1 text-sm font-bold lg:hidden"
          >
            <Icon name="chev" size={14} className="rotate-90" strokeWidth={3} />
            All tracks
          </button>

          {detail && summary ? (
            <TrackPath
              detail={detail}
              summary={summary}
              genre={genreOf(summary.genreId)}
              busy={busy}
              renaming={renaming}
              onRenaming={setRenaming}
              onSaveRename={saveRename}
              confirmDelete={confirmDelete}
              onConfirmDelete={setConfirmDelete}
              onDelete={deleteTrack}
              onPlay={setPlaying}
              onMove={move}
              onRemove={remove}
            />
          ) : (
            tracks &&
            tracks.length > 0 && <p className="text-sm font-bold text-muted-2">Loading the track…</p>
          )}
        </main>
      </div>

      {playing && (
        <PlayerModal
          key={playing.id}
          video={playing}
          onClose={closePlayer}
          onProgress={handleProgress}
          onEnded={playNext}
        />
      )}
    </>
  );
}

/** The right-hand side: one track as a path. */
function TrackPath({
  detail,
  summary,
  genre,
  busy,
  renaming,
  onRenaming,
  onSaveRename,
  confirmDelete,
  onConfirmDelete,
  onDelete,
  onPlay,
  onMove,
  onRemove,
}: {
  detail: TrackDetail;
  summary: TrackSummary;
  genre: GenreItem | null;
  busy: boolean;
  renaming: string | null;
  onRenaming: (name: string | null) => void;
  onSaveRename: (e: React.FormEvent) => void;
  confirmDelete: boolean;
  onConfirmDelete: (on: boolean) => void;
  onDelete: () => void;
  onPlay: (v: TrackVideo) => void;
  onMove: (v: TrackVideo, dir: "up" | "down") => void;
  onRemove: (v: TrackVideo) => void;
}) {
  const { videos } = detail;
  const done = videos.filter((v) => v.watched).length;
  // The next step: the first unwatched video in order.
  const nextIndex = videos.findIndex((v) => !v.watched);
  const next = nextIndex >= 0 ? videos[nextIndex] : null;
  const remaining = videos
    .filter((v) => !v.watched)
    .reduce((s, v) => s + v.durationSeconds * (1 - coveredRatio(v.watchProgress, v.durationSeconds)), 0);

  return (
    <article className="flex max-w-[900px] flex-col gap-5">
      {/* Title row */}
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-[240px] flex-1">
          <p className="flex items-center gap-1.5 font-display text-[11px] tracking-widest text-ink/75">
            {genre && <span className="h-2.5 w-2.5 border-[1.5px] border-ink" style={{ backgroundColor: genre.color }} />}
            TRACK{genre ? ` · ${genre.name.toUpperCase()}` : ""}
          </p>
          {renaming == null ? (
            <h2 className="mt-2 font-display text-[30px] leading-[1.1]">{detail.track.name}</h2>
          ) : (
            <form onSubmit={onSaveRename} className="mt-2 flex gap-2">
              <RenameInput value={renaming} onChange={onRenaming} onCancel={() => onRenaming(null)} />
              <Button type="submit" size="sm" variant="primary" disabled={busy || !renaming.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onRenaming(null)}>
                Cancel
              </Button>
            </form>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-2 text-right font-mono text-[13px] font-bold leading-tight">
            {done} of {videos.length} done
            {videos.length > 0 && (
              <>
                <br />
                <span className="font-normal text-ink/70">
                  {done === videos.length ? formatTotalTime(summary.totalSeconds) + " in total" : `${formatTotalTime(remaining)} left`}
                </span>
              </>
            )}
          </span>
          <IconButton label="Rename" className="h-9 min-w-9" onClick={() => onRenaming(detail.track.name)}>
            <Icon name="note" size={15} />
          </IconButton>
          <IconButton label="Delete track" align="right" className="h-9 min-w-9" onClick={() => onConfirmDelete(true)}>
            <Icon name="trash" size={15} />
          </IconButton>
        </div>
      </header>

      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-3 border-2 border-ink bg-ink px-4 py-3 text-sm text-cream">
          <span className="flex-1">
            <strong>Delete “{detail.track.name}”?</strong> Its {videos.length} video
            {videos.length === 1 ? "" : "s"} stay in your feed; only the track goes.
          </span>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="border-2 border-pink px-2.5 py-1 text-xs font-bold text-pink hover:bg-pink hover:text-ink"
          >
            Delete track
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(false)}
            className="border-2 border-cream px-2.5 py-1 text-xs font-bold hover:bg-cream hover:text-ink"
          >
            Keep it
          </button>
        </div>
      )}

      {/* Progress: a block per video — done, the next one, still to do. */}
      {videos.length > 0 &&
        (videos.length <= MAX_BLOCKS ? (
          <div className="flex gap-1" aria-label={`${done} of ${videos.length} done`} role="img">
            {videos.map((v, i) => (
              <span
                key={v.id}
                title={`${i + 1}. ${v.title}`}
                className={`h-3 flex-1 border-2 border-ink ${
                  v.watched ? "bg-ink" : i === nextIndex ? "bg-primary" : "bg-surface"
                }`}
              />
            ))}
          </div>
        ) : (
          <div className="h-3 border-2 border-ink bg-surface" role="img" aria-label={`${done} of ${videos.length} done`}>
            <div className="h-full bg-ink" style={{ width: `${(done / videos.length) * 100}%` }} />
          </div>
        ))}

      {/* Up next */}
      {next ? (
        <section className="flex flex-wrap items-center gap-5 border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_var(--color-ink)]">
          <button
            type="button"
            onClick={() => onPlay(next)}
            aria-label={`Play ${next.title}`}
            className="relative w-[220px] max-w-full shrink-0 border-2 border-ink bg-ink"
          >
            {next.thumbnail ? (
              <img src={next.thumbnail} alt="" referrerPolicy="no-referrer" className="aspect-video w-full object-cover" />
            ) : (
              <div className="aspect-video w-full" />
            )}
            <ProgressStrip video={next} />
          </button>
          <div className="flex min-w-[200px] flex-1 flex-col gap-2">
            <span className="font-display text-[11px] tracking-widest text-warn">UP NEXT · STEP {nextIndex + 1}</span>
            <span className="text-xl font-bold leading-snug">{next.title}</span>
            <span className="text-[13px] text-ink/75">
              {next.channelTitle}
              {next.durationSeconds > 0 && <> · <span className="font-mono">{formatDuration(next.durationSeconds)}</span></>}
              {next.resumeSeconds ? <> · resumes at <span className="font-mono">{formatDuration(next.resumeSeconds)}</span></> : null}
            </span>
          </div>
          <Button variant="primary" className="h-[42px]" onClick={() => onPlay(next)}>
            <Icon name="play" size={13} filled />
            {next.resumeSeconds ? "Resume" : "Continue"}
          </Button>
        </section>
      ) : videos.length > 0 ? (
        <section className="border-2 border-ink bg-tint p-5 shadow-hard">
          <p className="font-display text-xl">Track complete</p>
          <p className="mt-1 text-sm text-ink/75">
            All {videos.length} watched. Rewatch any step below, or add more videos from the feed.
          </p>
        </section>
      ) : (
        <section className="border-2 border-dashed border-muted-2 p-6 text-sm text-ink/75">
          <p className="font-display text-lg text-ink">This track is empty</p>
          <p className="mt-1">
            Add videos from the feed: the track button on any card, or search a topic and add all the
            results in upload order.
          </p>
        </section>
      )}

      {/* The path, in order */}
      {videos.length > 0 && (
        <ol className="border-2 border-ink bg-surface">
          {videos.map((v, i) => {
            const isNext = i === nextIndex;
            const pct = Math.round(coveredRatio(v.watchProgress, v.durationSeconds) * 100);
            return (
              <li
                key={v.id}
                className={`group flex items-center gap-4 border-t-2 border-line-2 px-4 py-2.5 first:border-t-0 ${
                  isNext ? "bg-tint" : ""
                }`}
              >
                <span
                  className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center border-2 border-ink font-mono text-xs font-bold ${
                    v.watched ? "bg-ink text-cream" : isNext ? "bg-primary" : "bg-surface"
                  }`}
                >
                  {v.watched ? <Icon name="check" size={13} strokeWidth={3.5} /> : i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onPlay(v)}
                  className={`min-w-0 flex-1 truncate text-left text-[14.5px] font-bold hover:underline ${
                    v.watched ? "text-ink/55" : ""
                  }`}
                  title={`Play ${v.title}`}
                >
                  {v.title}
                </button>
                <span className="hidden w-36 truncate text-[12.5px] text-ink/70 md:block">{v.channelTitle}</span>
                <span className="hidden w-20 text-xs text-ink/70 sm:block">
                  {v.answerCount > 0 ? `${v.answerCount} answer${v.answerCount === 1 ? "" : "s"}` : ""}
                </span>
                <span className="w-14 text-right font-mono text-[12.5px] font-bold">
                  {!v.watched && pct > 0 ? <span className="text-warn">{pct}%</span> : formatDuration(v.durationSeconds)}
                </span>
                {/* Reorder and remove: on hover (always visible on touch screens). */}
                <span className="flex gap-1 opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
                  <StepButton label="Move up" disabled={busy || i === 0} onClick={() => onMove(v, "up")}>
                    <Icon name="chevUp" size={13} strokeWidth={3} />
                  </StepButton>
                  <StepButton label="Move down" disabled={busy || i === videos.length - 1} onClick={() => onMove(v, "down")}>
                    <Icon name="chev" size={13} strokeWidth={3} />
                  </StepButton>
                  <StepButton label="Remove from track" disabled={busy} onClick={() => onRemove(v)}>
                    <Icon name="x" size={13} strokeWidth={3} />
                  </StepButton>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

/**
 * The rename box. It opens with the whole name selected, so typing replaces
 * it — done once on open (not on focus, which doesn't reliably fire for an
 * input that appears already focused).
 */
function RenameInput({
  value,
  onChange,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="nb-input min-w-0 flex-1 px-2.5 py-1.5 font-display text-xl"
      value={value}
      maxLength={60}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      aria-label="Track name"
    />
  );
}

/** Thin played-so-far bar along the bottom of a thumbnail. */
function ProgressStrip({ video }: { video: FeedVideo }) {
  const pct = Math.round(coveredRatio(video.watchProgress, video.durationSeconds) * 100);
  if (pct <= 0) return null;
  return (
    <span className="absolute inset-x-0 bottom-0 h-[5px] bg-faint">
      <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
    </span>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <IconButton label={label} align="right" onClick={onClick} disabled={disabled} className="h-7 min-w-7 disabled:opacity-25">
      {children}
    </IconButton>
  );
}
