"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedVideo } from "./types";
import { api } from "@/lib/api-client";
import type { Chapter } from "@/lib/chapters";
import { formatDuration } from "@/lib/format";
import { CHUNK_SECONDS, chunkCount, mergeProgress } from "@/lib/progress";
import { loadYouTubeApi, type YTPlayer } from "@/lib/youtubePlayer";
import Button from "./ui/Button";
import Icon from "./ui/Icon";
import IconButton from "./ui/IconButton";

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
  /** Playing through a list (Shorts' "Play unseen in a row"): shows where
   *  you are and a Next button that skips ahead without marking it seen. */
  queue?: { label: string; onNext: () => void };
  /** Start here (a chapter picked in the panel) instead of the resume point. */
  startAt?: number;
  /** Podcasts (FEAT-14): load the chapters and show the chapter strip. */
  showChapters?: boolean;
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
  queue,
  startAt,
  showChapters = false,
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
  // A picked chapter wins over the resume point.
  const [resumedAt] = useState(() => (startAt != null ? 0 : resumePoint(video)));
  const [firstSecond] = useState(() => (startAt != null ? Math.floor(startAt) : resumedAt));
  const [startedOver, setStartedOver] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // Where playback is (updated every second while playing): the current chapter.
  const [position, setPosition] = useState(firstSecond);
  const currentChip = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showChapters) return;
    api(`/api/videos/${video.id}/chapters`)
      .then((d) => setChapters(d.chapters ?? []))
      .catch(() => {});
  }, [showChapters, video.id]);

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
      setPosition(t);
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
            ...(firstSecond ? { start: firstSecond } : {}),
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

  // The chapter playing now: the last one that has started.
  const current = chapters.reduce((at, c, i) => (c.start <= position + 0.5 ? i : at), 0);
  function playChapter(i: number) {
    const c = chapters[Math.max(0, Math.min(i, chapters.length - 1))];
    if (!c || !playerRef.current) return;
    playerRef.current.seekTo(c.start, true);
    playerRef.current.playVideo();
    setPosition(c.start);
  }
  // Keep the current chapter's chip in view as playback moves on.
  useEffect(() => {
    currentChip.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-lg border-[1.5px] border-ink bg-surface p-4 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {queue && (
              <p className="mb-1 label-caps">{queue.label}</p>
            )}
            <h2 className="text-lg font-semibold">{video.title}</h2>
            <p className="mt-0.5 text-meta text-muted">
              {video.channelTitle}
              {video.durationSeconds > 0 && <> · <span className="font-mono">{formatDuration(video.durationSeconds)}</span></>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {resumedAt > 0 && !startedOver && !fallback && (
              <Button size="sm" onClick={startOver} title="Play from the beginning">
                <Icon name="undo" size={13} />
                Resumed at <span className="font-mono">{formatDuration(resumedAt)}</span> · Start over
              </Button>
            )}
            {queue && (
              <Button size="sm" onClick={queue.onNext} title="Skip to the next one (this one isn't marked seen)">
                Next
                <Icon name="chev" size={13} className="-rotate-90" />
              </Button>
            )}
            <IconButton label="Close (Esc)" align="right" tipBelow onClick={onClose}>
              <Icon name="x" size={16} />
            </IconButton>
          </div>
        </div>
        <div
          className={`relative w-full overflow-hidden rounded-md bg-ink ${
            video.isShort ? "mx-auto aspect-[9/16] max-w-sm" : "aspect-video"
          }`}
        >
          {fallback ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${video.ytVideoId}?autoplay=1&rel=0${
                firstSecond ? `&start=${firstSecond}` : ""
              }`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div ref={mountRef} className="absolute inset-0 h-full w-full" />
          )}
        </div>
        {/* Chapters (podcasts): the one playing is highlighted; jump to any. */}
        {chapters.length > 0 && !fallback && (
          <div className="mt-3 flex items-center gap-2">
            <IconButton label="Previous chapter" onClick={() => playChapter(current - 1)} disabled={current === 0}>
              <Icon name="chev" size={15} className="rotate-90" />
            </IconButton>
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:thin]">
              {chapters.map((c, i) => (
                <button
                  key={i}
                  ref={i === current ? currentChip : undefined}
                  type="button"
                  onClick={() => playChapter(i)}
                  aria-current={i === current ? "true" : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-meta ${
                    i === current
                      ? "border-ink bg-primary font-semibold text-ink"
                      : "border-line text-muted hover:border-ink hover:text-ink"
                  }`}
                >
                  <span className="font-mono text-xs">{c.start === 0 ? "0:00" : formatDuration(c.start)}</span>
                  <span className="max-w-[220px] truncate">{c.title}</span>
                </button>
              ))}
            </div>
            <IconButton
              label="Next chapter"
              align="right"
              onClick={() => playChapter(current + 1)}
              disabled={current >= chapters.length - 1}
            >
              <Icon name="chev" size={15} className="-rotate-90" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
