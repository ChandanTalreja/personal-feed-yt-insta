"use client";

import { useCallback, useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import PlayerModal, { type ProgressUpdate } from "@/components/PlayerModal";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Spinner from "@/components/ui/Spinner";
import { notifyNavChanged } from "@/lib/nav-events";
import type { GenreItem } from "@/components/types";
import { api, rememberedReply } from "@/lib/api-client";
import { trackLine, type TrackDetail, type TrackSummary, type TrackVideo } from "./model";
import TrackPath from "./TrackPath";

/**
 * Learning tracks: your tracks on the left (progress, time left, last
 * watched); the chosen one on the right as a path — a block per video, the
 * next step with Continue, and the full list in order.
 */
/** The tracks you're working on first: most recently watched, then newest. */
function mostActiveFirst(list: TrackSummary[]): TrackSummary[] {
  return [...list].sort((a, b) =>
    (b.lastPlayedAt ?? b.createdAt).localeCompare(a.lastPlayedAt ?? a.createdAt)
  );
}

export default function TracksClient() {
  // Coming back to Tracks starts from the copies remembered in this tab
  // (instant), then refreshes (see lib/api-client.ts).
  const [seen] = useState(() => {
    const list = rememberedReply("/api/tracks")?.tracks as TrackSummary[] | undefined;
    if (!list) return null;
    const tracks = mostActiveFirst(list);
    const wanted = Number(new URLSearchParams(window.location.search).get("t"));
    const pick = tracks.find((t) => t.id === wanted) ?? tracks[0];
    return { tracks, pick, detail: pick ? rememberedReply<TrackDetail>(`/api/tracks/${pick.id}`) : undefined };
  });
  const [tracks, setTracks] = useState<TrackSummary[] | null>(seen?.tracks ?? null);
  const [genres, setGenres] = useState<GenreItem[]>(() => rememberedReply("/api/genres")?.genres ?? []);
  const [selectedId, setSelectedId] = useState<number | null>(seen?.pick?.id ?? null);
  const [detail, setDetail] = useState<TrackDetail | null>(seen?.detail ?? null);
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
    const data = await api("/api/tracks", { fallback: "Couldn't load tracks" });
    const list = mostActiveFirst(data.tracks);
    setTracks(list);
    return list;
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    // A track opened before in this tab shows at once; the fresh copy follows.
    const remembered = rememberedReply<TrackDetail>(`/api/tracks/${id}`);
    if (remembered) setDetail(remembered);
    const data = await api(`/api/tracks/${id}`, { fallback: "Couldn't load the track" });
    setDetail(data);
    return data as TrackDetail;
  }, []);

  useEffect(() => {
    api("/api/genres")
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

  /** A change to a track; the top bar's counts follow it. */
  async function change(method: string, path: string, body?: unknown) {
    const data = await api(path, { method, body });
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
      const { track } = await change("POST", "/api/tracks", { name: newName });
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
      const { track } = await change("PATCH", `/api/tracks/${detail.track.id}`, { name: renaming });
      setDetail({ ...detail, track });
      setRenaming(null);
      await loadTracks();
    });
  };

  const deleteTrack = () =>
    detail &&
    run(async () => {
      await change("DELETE", `/api/tracks/${detail.track.id}`);
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
      await change("POST", `/api/tracks/${detail.track.id}/move`, { videoId: video.id, direction });
      await loadDetail(detail.track.id);
    });

  const remove = (video: TrackVideo) =>
    detail &&
    run(async () => {
      await change("DELETE", `/api/tracks/${detail.track.id}/videos?videoId=${video.id}`);
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
    <aside className="flex w-full flex-col border-line lg:sticky lg:top-[65px] lg:h-[calc(100vh-65px)] lg:w-[380px] lg:shrink-0 lg:border-r">
      <div className="flex flex-col gap-3 border-b border-line p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-display">Tracks</h1>
            <span className="pen-note">one step at a time</span>
          </div>
          <Button size="sm" onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
            <Icon name="plus" size={13} />
            New track
          </Button>
        </div>
        {creating && (
          <form onSubmit={createTrack} className="flex gap-2">
            <input
              className="field h-8 min-w-0 flex-1 px-2.5 text-sm"
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

      {tracks == null && !error && <Spinner label="Loading tracks…" className="p-6 text-sm font-semibold text-muted" />}
      {tracks?.length === 0 && (
        <div className="p-6 text-sm text-muted">
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
                className={`flex w-full flex-col gap-2.5 border-b border-l-[3px] border-b-line px-5 py-4 text-left transition-colors ${
                  on ? "border-l-primary bg-surface" : "border-l-transparent hover:bg-ink/[0.03]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: g?.color ?? "var(--color-line)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-lg font-semibold">{t.name}</span>
                  <span className="font-mono text-xs text-muted">
                    {t.watchedCount}/{t.count}
                  </span>
                </span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-meta text-muted">{trackLine(t)}</span>
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
        <div role="alert" className="mx-4 mt-4 rounded-md border-[1.5px] border-danger bg-surface px-4 py-2 text-sm font-semibold text-danger">{error}</div>
      )}
      <div className="flex flex-col lg:flex-row lg:items-start">
        {/* Wide screens: the wrapper vanishes so the list can stay put (sticky). */}
        <div className={`${reading ? "hidden" : "block"} lg:contents`}>{list}</div>

        <main className={`${reading ? "block" : "hidden lg:block"} min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-7`}>
          <button
            type="button"
            onClick={() => setReading(false)}
            className="mb-4 flex items-center gap-1 text-sm font-semibold lg:hidden"
          >
            <Icon name="chev" size={14} className="rotate-90" />
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
            tracks.length > 0 && <Spinner label="Loading the track…" className="text-sm font-semibold text-muted" />
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
