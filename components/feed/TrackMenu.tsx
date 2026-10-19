"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Spinner from "@/components/ui/Spinner";
import { notifyNavChanged } from "@/lib/nav-events";
import { api } from "@/lib/api-client";

interface TrackRow {
  id: number;
  name: string;
  count: number;
  contains?: boolean;
}

type Props =
  | {
      /** Card menu: tick/untick which tracks this video is in. */
      mode: "toggle";
      videoId: number;
    }
  | {
      /** Bulk add: pick (or create) one track; the caller does the adding. */
      mode: "pick";
      onPick: (track: { id: number; name: string }) => void;
      busy?: boolean;
    };

/**
 * Track chooser shown inline (cards clip pop-ups). Lists your tracks and
 * lets you create a new one by name. Shared by the card's + TRACK panel and
 * the feed's "add these results to a track" panel.
 */
export default function TrackMenu(props: Props) {
  const [tracks, setTracks] = useState<TrackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [working, setWorking] = useState<number | "new" | null>(null);

  const videoId = props.mode === "toggle" ? props.videoId : undefined;

  useEffect(() => {
    fetch(videoId ? `/api/tracks?videoId=${videoId}` : "/api/tracks")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setTracks(d.tracks);
      })
      .catch((err) => setError((err as Error).message));
  }, [videoId]);

  async function toggle(track: TrackRow) {
    if (props.mode !== "toggle") return;
    setWorking(track.id);
    setError(null);
    const adding = !track.contains;
    // Optimistic: flip the tick now, roll back if the server says no.
    setTracks((list) =>
      list?.map((t) =>
        t.id === track.id
          ? { ...t, contains: adding, count: t.count + (adding ? 1 : -1) }
          : t
      ) ?? null
    );
    try {
      const fallback = "Couldn't update the track";
      await (adding
        ? api(`/api/tracks/${track.id}/videos`, { method: "POST", body: { videoIds: [props.videoId] }, fallback })
        : api(`/api/tracks/${track.id}/videos?videoId=${props.videoId}`, { method: "DELETE", fallback }));
    } catch (err) {
      setError((err as Error).message);
      setTracks((list) =>
        list?.map((t) => (t.id === track.id ? track : t)) ?? null
      );
    } finally {
      setWorking(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setWorking("new");
    setError(null);
    try {
      const data = await api("/api/tracks", {
        method: "POST",
        body: props.mode === "toggle" ? { name, videoIds: [props.videoId] } : { name },
        fallback: "Couldn't create the track",
      });
      notifyNavChanged();
      setNewName("");
      if (props.mode === "pick") {
        props.onPick({ id: data.track.id, name: data.track.name });
      } else {
        setTracks((list) => [
          { id: data.track.id, name: data.track.name, count: 1, contains: true },
          ...(list ?? []),
        ]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  }

  const busy = props.mode === "pick" && props.busy;

  return (
    <div className="flex flex-col gap-2 text-meta">
      {tracks == null && !error && <Spinner label="Loading tracks…" size={13} className="font-semibold" />}
      {tracks && tracks.length === 0 && (
        <p className="text-muted">No tracks yet. Name your first one below.</p>
      )}
      {tracks && tracks.length > 0 && (
        <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
          {tracks.map((t) =>
            props.mode === "toggle" ? (
              <label
                key={t.id}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 hover:bg-ink/5"
              >
                <input
                  type="checkbox"
                  checked={!!t.contains}
                  disabled={working === t.id}
                  onChange={() => toggle(t)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="flex-1 font-semibold">{t.name}</span>
                <span className="font-mono text-xs text-muted">{t.count}</span>
              </label>
            ) : (
              <button
                key={t.id}
                className="chip flex h-8 items-center justify-between rounded-sm px-2.5 text-left"
                disabled={busy}
                onClick={() => props.onPick({ id: t.id, name: t.name })}
              >
                <span>{t.name}</span>
                <span className="font-mono text-xs text-muted">{t.count}</span>
              </button>
            )
          )}
        </div>
      )}
      <form onSubmit={create} className="flex gap-1.5">
        <input
          className="field h-8 min-w-0 flex-1 rounded-sm px-2.5"
          placeholder="New track name, e.g. Kubernetes"
          value={newName}
          maxLength={60}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="New track name"
        />
        <button
          type="submit"
          className={buttonClass("primary", "sm")}
          disabled={!newName.trim() || working === "new" || busy}
        >
          {working === "new" ? <Spinner label="Adding" size={13} /> : <><Icon name="plus" size={13} />New</>}
        </button>
      </form>
      {error && <p className="font-semibold text-danger">{error}</p>}
    </div>
  );
}
