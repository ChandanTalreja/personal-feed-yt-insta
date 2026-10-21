"use client";

import { useEffect, useRef, useState } from "react";
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
      /** How many tracks the video is in now (after each change). */
      onInCount?: (count: number) => void;
      /** Put the cursor in "New track name" when the menu appears. */
      autoFocus?: boolean;
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
  // "Added to Kubernetes": a short confirmation under the list, so a tick
  // that only nudges a small count isn't missed.
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameBox = useRef<HTMLInputElement>(null);

  const videoId = props.mode === "toggle" ? props.videoId : undefined;
  const autoFocus = props.mode === "toggle" && props.autoFocus;
  const onInCount = props.mode === "toggle" ? props.onInCount : undefined;
  const onInCountRef = useRef(onInCount);
  useEffect(() => {
    onInCountRef.current = onInCount;
  });

  // Opened to add to a track: the cursor goes to the name box. This runs
  // after the panel's Ask box has taken the cursor (FIX-02), and the Ask
  // box never takes it back from another text field. Not on touch screens,
  // where focusing would pop the keyboard up.
  useEffect(() => {
    if (!autoFocus || window.matchMedia("(pointer: coarse)").matches) return;
    nameBox.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Keep the card's track icon in step with the ticks (also corrects it
  // when the list first loads).
  useEffect(() => {
    if (tracks) onInCountRef.current?.(tracks.filter((t) => t.contains).length);
  }, [tracks]);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  function confirm(next: Notice) {
    setNotice(next);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

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
      confirm({ kind: adding ? "added" : "removed", name: track.name });
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
        confirm({ kind: "created", name: data.track.name });
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
          ref={nameBox}
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
      {notice && !error && <NoticeLine notice={notice} />}
      {error && <p className="font-semibold text-danger">{error}</p>}
    </div>
  );
}

type Notice = { kind: "added" | "removed" | "created"; name: string };

/**
 * The track name gets a thick straight underline: yellow (the app's "on"
 * colour, like the lit track icon on the card) when the video went in, red
 * when it came out. Thick because yellow on cream is faint.
 */
function NoticeLine({ notice }: { notice: Notice }) {
  const removed = notice.kind === "removed";
  const name = (
    <span
      className={`underline decoration-4 underline-offset-2 [text-decoration-skip-ink:none] ${
        removed ? "decoration-danger" : "decoration-primary"
      }`}
    >
      {notice.name}
    </span>
  );
  return (
    <p role="status" className="flex items-center gap-1.5 font-semibold">
      <Icon name={removed ? "x" : "check"} size={13} />
      <span>
        {notice.kind === "added" && <>Added to {name}</>}
        {notice.kind === "removed" && <>Removed from {name}</>}
        {notice.kind === "created" && <>Created {name} and added this video</>}
      </span>
    </p>
  );
}
