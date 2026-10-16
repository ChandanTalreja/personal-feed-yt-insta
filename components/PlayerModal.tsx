"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedVideo } from "./types";
import { formatDuration } from "@/lib/format";
import { CHUNK_SECONDS, chunkCount, mergeProgress } from "@/lib/progress";
import { loadYouTubeApi, type YTPlayer } from "@/lib/youtubePlayer";

/** What the server sends back after a progress save. */
export interface ProgressUpdate {
  id: number;
  watched: boolean;
  laterAt: string | null;
  watchProgress: string | null;
  resumeSeconds: number | null;
}

interface Props {
  video: FeedVideo;
  onClose: () => void;
  onProgress: (update: ProgressUpdate) => void;
  /** Called when the video plays to the end (tracks use it to auto-advance). */
  onEnded?: () => void;
}

const TICK_MS = 1000;
const SAVE_EVERY_MS = 15_000;

/** Resume only if it's worth it: not the first few seconds, not the end. */
function resumePoint(video: FeedVideo): number {
  const r = video.resumeSeconds ?? 0;
  const d = video.durationSeconds;
  return r > 10 && (d === 0 || r < d - 15) ? r : 0;
}

export default function PlayerModal({
  video,
  onClose,
  onProgress,
  onEnded,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  // Latest callbacks without re-running the player effect on every render.
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onProgressRef.current = onProgress;
    onEndedRef.current = onEnded;
  });
  const [fallback, setFallback] = useState(false);
  const [resumedAt] = useState(() => resumePoint(video));
  const [startedOver, setStartedOver] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Player + honest-watched tracking.
  useEffect(() => {
    let cancelled = false;
    let tick: ReturnType<typeof setInterval> | undefined;
    let saver: ReturnType<typeof setInterval> | undefined;

    // Played seconds per chunk in THIS sitting; a chunk counts once at least
    // half of it was actually played (so a 1-second seek-and-stop doesn't).
    const playedInChunk = new Map<number, number>();
    let progress = video.watchProgress ?? "";
    let dirty = false;
    let lastTime: number | null = null;
    let lastSavedResume = video.resumeSeconds ?? 0;
    let ended = false;

    function duration(): number {
      return playerRef.current?.getDuration() || video.durationSeconds;
    }

    function markChunk(i: number) {
      const total = chunkCount(duration());
      if (i < 0 || i >= total || progress[i] === "1") return;
      const bits = progress.padEnd(total, "0").split("");
      bits[i] = "1";
      progress = bits.join("");
      dirty = true;
    }

    function onTick() {
      const p = playerRef.current;
      const YT = window.YT;
      if (!p || !YT) return;
      if (p.getPlayerState() !== YT.PlayerState.PLAYING) {
        lastTime = null; // paused/buffering: next tick re-baselines
        return;
      }
      const t = p.getCurrentTime();
      if (lastTime != null) {
        const delta = t - lastTime;
        // Normal playback moves ~1s per tick (up to ~2s at 2× speed). Bigger
        // jumps are seeks and backwards moves are rewinds — neither counts.
        if (delta > 0 && delta <= 3) {
          const i = Math.floor(lastTime / CHUNK_SECONDS);
          const played = (playedInChunk.get(i) ?? 0) + delta;
          playedInChunk.set(i, played);
          const chunkLen = Math.min(
            CHUNK_SECONDS,
            Math.max(1, duration() - i * CHUNK_SECONDS)
          );
          if (played >= chunkLen / 2) markChunk(i);
        }
      }
      lastTime = t;
    }

    function save(final = false) {
      const p = playerRef.current;
      const resume = ended ? 0 : Math.floor(p?.getCurrentTime() ?? lastSavedResume);
      const resumeMoved = Math.abs(resume - lastSavedResume) >= 5;
      if (!dirty && !resumeMoved) return;
      const body = JSON.stringify({ progress, resumeSeconds: resume });
      dirty = false;
      lastSavedResume = resume;
      fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        // Lets the last save finish even as the modal (or tab) closes.
        keepalive: final,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.video) {
            // Keep our copy in step with the server's merged version.
            progress = mergeProgress(progress, data.video.watchProgress);
            onProgressRef.current(data.video);
          }
        })
        .catch(() => {
          dirty = true; // try again on the next save
        });
    }

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return;
        // The API replaces the element it's given with an iframe, so hand it
        // a fresh child every time (React may mount this effect twice).
        mountRef.current.innerHTML = "";
        const el = document.createElement("div");
        mountRef.current.appendChild(el);
        playerRef.current = new YT.Player(el, {
          host: "https://www.youtube-nocookie.com",
          videoId: video.ytVideoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            rel: 0,
            playsinline: 1,
            ...(resumedAt ? { start: resumedAt } : {}),
          },
          events: {
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) {
                ended = true;
                save();
                onEndedRef.current?.();
              } else if (e.data === YT.PlayerState.PAUSED) {
                save();
              } else if (e.data === YT.PlayerState.PLAYING) {
                ended = false;
              }
            },
          },
        });
        tick = setInterval(onTick, TICK_MS);
        saver = setInterval(() => save(), SAVE_EVERY_MS);
      })
      .catch(() => {
        // Tracking is a bonus: if the API can't load, just play the video.
        if (!cancelled) setFallback(true);
      });

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(saver);
      save(true);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Re-create the player only for a different video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  function startOver() {
    playerRef.current?.seekTo(0, true);
    setStartedOver(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="nb w-full max-w-4xl rounded-xl bg-[var(--paper)] p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="font-display text-sm sm:text-base">{video.title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {resumedAt > 0 && !startedOver && !fallback && (
              <button
                className="nb-chip rounded px-2.5 py-1 text-xs"
                onClick={startOver}
                title="Play from the beginning"
              >
                RESUMED AT {formatDuration(resumedAt)} · START OVER
              </button>
            )}
            <button
              className="nb-btn rounded px-3 py-1 text-sm"
              onClick={onClose}
            >
              ✕ CLOSE
            </button>
          </div>
        </div>
        <div
          className={`relative w-full overflow-hidden rounded-lg border-3 border-[var(--ink)] ${
            video.isShort ? "mx-auto aspect-[9/16] max-w-sm" : "aspect-video"
          }`}
        >
          {fallback ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${video.ytVideoId}?autoplay=1&rel=0${
                resumedAt ? `&start=${resumedAt}` : ""
              }`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div ref={mountRef} className="absolute inset-0 h-full w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
