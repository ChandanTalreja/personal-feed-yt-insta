"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import IconButton from "@/components/ui/IconButton";
import { Thumb } from "@/components/ui/Media";
import type { FeedVideo, TrackStep } from "@/components/types";
import { formatDuration } from "@/lib/format";

/**
 * Podcasts' "Continue listening" (FEAT-14) and the Feed's "Pick up where
 * you left off" (FEAT-12): one slim row of small tiles (thumbnail, title,
 * progress, time left) that scrolls sideways, so a handful of half-watched
 * videos never pushes the new ones down. On the Feed, the last tile is
 * your latest track's next step. The arrows only show when there's more
 * to scroll to.
 */
export default function ContinueStrip({
  title,
  videos,
  track = null,
  onPlay,
}: {
  title: string;
  videos: FeedVideo[];
  track?: TrackStep | null;
  onPlay: (video: FeedVideo) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const count = videos.length + (track ? 1 : 0);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, count]);

  // One press moves about a screenful of tiles, minus one so you keep your place.
  function scroll(direction: 1 | -1) {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * Math.max(280, el.clientWidth - 280), behavior: "smooth" });
  }

  return (
    <section className="mb-8">
      <h2 className="label-caps mb-3 text-muted">
        {title} · <span className="font-mono">{count}</span>
      </h2>
      <div className="flex items-center gap-2">
        {canLeft && (
          <IconButton label="Scroll left" onClick={() => scroll(-1)}>
            <Icon name="chev" size={15} className="rotate-90" />
          </IconButton>
        )}
        <div
          ref={scroller}
          onScroll={measure}
          className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {videos.map((v) => {
            const left = Math.max(0, v.durationSeconds - (v.resumeSeconds ?? 0));
            return (
              <Tile
                key={v.id}
                video={v}
                label={v.title}
                detail={left > 0 ? `${formatDuration(left)} left` : v.channelTitle}
                onPlay={onPlay}
              />
            );
          })}
          {track && (
            <Tile
              video={track.video}
              label={`Up next in ${track.trackName}: ${track.video.title}`}
              detail={`Step ${track.step} of ${track.count}`}
              onPlay={onPlay}
            />
          )}
        </div>
        {canRight && (
          <IconButton label="Scroll right" align="right" onClick={() => scroll(1)}>
            <Icon name="chev" size={15} className="-rotate-90" />
          </IconButton>
        )}
      </div>
    </section>
  );
}

/** One tile: thumbnail (play on hover), a title line, progress, and a detail line. */
function Tile({
  video,
  label,
  detail,
  onPlay,
}: {
  video: FeedVideo;
  label: string;
  detail: string;
  onPlay: (video: FeedVideo) => void;
}) {
  const resume = video.resumeSeconds ?? 0;
  const pct = video.durationSeconds > 0 ? Math.min(100, Math.round((resume / video.durationSeconds) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={() => onPlay(video)}
      title={label}
      className="group flex w-[280px] shrink-0 items-center gap-2.5 rounded-lg border border-line bg-surface p-2 text-left transition-colors hover:border-ink"
    >
      <span className="relative shrink-0">
        <Thumb src={video.thumbnail} className="w-[76px] rounded-sm" />
        <span className="absolute inset-0 flex items-center justify-center rounded-sm bg-ink/0 text-white opacity-0 transition group-hover:bg-ink/35 group-hover:opacity-100">
          <Icon name="play" size={16} filled />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-meta font-semibold">{label}</span>
        <span className="h-1 overflow-hidden rounded-full bg-ink/10">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </span>
        <span className="font-mono text-xs text-muted">{detail}</span>
      </span>
    </button>
  );
}
