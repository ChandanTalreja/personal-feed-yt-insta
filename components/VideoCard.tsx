"use client";

/* eslint-disable @next/next/no-img-element */

import type { ReactNode } from "react";
import { formatDuration, timeAgo } from "@/lib/format";
import { coveredRatio } from "@/lib/progress";
import Icon, { type IconName } from "./ui/Icon";
import type { FeedVideo } from "./types";

/** The study panel's tabs; "track" opens the Add-to-track chooser. */
export type StudyTool = "ask" | "summary" | "transcript" | "note" | "track";

interface Props {
  video: FeedVideo;
  genreColor: string;
  /** Dim seen cards and offer Undo. Off on History, where everything is seen. */
  dimSeen: boolean;
  /** The tool open in the study panel for this card, if any. */
  activeTool: StudyTool | null;
  onPlay: (video: FeedVideo) => void;
  onToggleWatched: (video: FeedVideo) => void;
  onToggleLater: (video: FeedVideo) => void;
  onOpenTool: (video: FeedVideo, tool: StudyTool) => void;
}

/**
 * One video in the feed. Flat at rest; it lifts when you hover it, and gets a
 * yellow edge while its tool is open in the study panel. Triage lives on the
 * thumbnail (✓ seen top-left, bookmark top-right — shown on hover, and kept
 * once set); studying lives in the tool row under the title, and every tool
 * opens the study panel rather than a popup inside the card.
 */
export default function VideoCard({
  video,
  genreColor,
  dimSeen,
  activeTool,
  onPlay,
  onToggleWatched,
  onToggleLater,
  onOpenTool,
}: Props) {
  const progressPct = Math.round(
    coveredRatio(video.watchProgress, video.durationSeconds) * 100
  );
  const dimmed = video.watched && dimSeen;
  const saved = video.laterAt != null;
  const selected = activeTool != null;

  return (
    <article
      // @container: the tool strip hides the "Ask" word when the card is
      // narrow (shorts), measured on the card itself, not the window.
      className={`group/card @container relative flex flex-col rounded-lg border bg-surface ${
        selected
          ? "border-ink shadow-[5px_5px_0_var(--color-primary)]"
          : "lift border-line"
      }`}
    >
      <button
        type="button"
        className={`relative block w-full cursor-pointer overflow-hidden rounded-t-[9px] bg-ink text-left ${
          dimmed ? "opacity-45" : ""
        }`}
        onClick={() => onPlay(video)}
        aria-label={`Play ${video.title}`}
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="aspect-video w-full bg-muted" />
        )}
        {video.durationSeconds > 0 && (
          <span className="absolute bottom-2 right-2 rounded-xs bg-ink/85 px-1.5 font-mono text-xs font-bold leading-5 text-white">
            {formatDuration(video.durationSeconds)}
          </span>
        )}
        {(video.isShort || video.isLive) && (
          <span className="absolute bottom-2 left-2 rounded-xs bg-ink/85 px-1.5 text-xs font-semibold leading-5 text-white">
            {video.isLive ? "Stream" : "Short"}
          </span>
        )}
        {progressPct > 0 && (
          // How much has actually been played (sittings add up) — the same
          // numbers the 50% auto-watched rule uses.
          <span className="absolute inset-x-0 bottom-0 h-[5px] bg-ink/55" title={`${progressPct}% watched`}>
            <span className="block h-full bg-primary" style={{ width: `${progressPct}%` }} />
          </span>
        )}
      </button>

      {/* Corner toggles sit over the thumbnail but outside its button —
          a button can't contain another button. */}
      <CornerToggle
        className="left-2 top-2"
        on={video.watched}
        label={video.watched ? "Mark unseen" : "Mark seen"}
        align="left"
        onClick={() => onToggleWatched(video)}
      >
        <Icon name="check" size={16} />
      </CornerToggle>
      <CornerToggle
        className="right-2 top-2"
        on={saved}
        label={saved ? "Remove from Watch later" : "Watch later"}
        align="right"
        onClick={() => onToggleLater(video)}
      >
        {/* Saved = yellow inside the bookmark, not a yellow box. */}
        <Icon name="bookmark" size={16} lit={saved} />
      </CornerToggle>

      {/* Seen in place, with a way back — a misclick costs nothing. */}
      {dimmed && (
        <div className="absolute left-[46px] top-2.5 flex h-[26px] items-center gap-2 rounded-sm bg-ink px-2 text-xs font-semibold text-cream">
          Seen
          <button
            type="button"
            className="flex items-center gap-1 text-primary hover:underline"
            onClick={() => onToggleWatched(video)}
          >
            <Icon name="undo" size={13} />
            Undo
          </button>
        </div>
      )}

      <div className={`flex flex-col gap-2 px-3.5 pb-2.5 pt-3 ${dimmed ? "opacity-45" : ""}`}>
        <h3 className="line-clamp-2 min-h-[2.7em] text-lg font-semibold" title={video.title}>
          {video.title}
        </h3>
        <div className="flex min-w-0 items-center gap-1.5 text-meta text-muted">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: genreColor }}
          />
          <span className="truncate font-medium text-ink" title={video.channelTitle}>
            {video.channelTitle}
          </span>
          <span className="shrink-0 whitespace-nowrap">· {timeAgo(video.publishedAt)}</span>
        </div>
      </div>

      {/* Tool row: Ask first (with its saved-answer count), then icons. */}
      <div className="mt-auto flex items-center gap-0.5 border-t border-line px-1.5 py-1.5 @min-[12rem]:px-2">
        <StripButton
          active={activeTool === "ask"}
          label="Ask about this video"
          onClick={() => onOpenTool(video, "ask")}
          className="mr-auto shrink-0 justify-start gap-1.5 px-1.5 @min-[12rem]:pl-2 @min-[12rem]:pr-2.5"
          align="left"
        >
          <Icon name="ask" size={18} lit={video.answerCount > 0} />
          <span className={`hidden text-meta font-semibold @min-[12rem]:inline ${activeTool === "ask" ? "" : "text-ink"}`}>Ask</span>
          {video.answerCount > 0 && (
            <span className="rounded-xs bg-primary px-1 font-mono text-xs font-bold leading-4 text-ink">
              {video.answerCount}
            </span>
          )}
        </StripButton>
        {(
          [
            ["summary", "summary", "Summary"],
            ["transcript", "text", "Transcript"],
            ["note", "note", video.personalNote ? "Your note" : "Note"],
            ["track", "track", "Add to track"],
          ] as [StudyTool, IconName, string][]
        ).map(([tool, icon, label], i, all) => (
          <StripButton
            key={tool}
            active={activeTool === tool}
            label={label}
            onClick={() => onOpenTool(video, tool)}
            className="w-7 shrink-0 justify-center @min-[12rem]:w-8"
            align={i === all.length - 1 ? "right" : "center"}
          >
            {/* A lit note icon means a note already exists. */}
            <Icon name={icon} size={18} lit={tool === "note" && !!video.personalNote} />
          </StripButton>
        ))}
      </div>
    </article>
  );
}

/** Hover label shared by the corner toggles and the strip (instant, unlike `title`). */
function HoverLabel({ text, align, below }: { text: string; align: "left" | "center" | "right"; below?: boolean }) {
  const anchor =
    align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span
      className={`pointer-events-none absolute z-30 hidden whitespace-nowrap rounded-xs bg-ink px-2 py-1 text-xs font-semibold text-cream group-hover/tip:block group-focus-visible/tip:block ${anchor} ${
        below ? "top-full mt-1.5" : "bottom-full mb-1.5"
      }`}
    >
      {text}
    </span>
  );
}

function CornerToggle({
  className,
  on,
  label,
  align,
  onClick,
  children,
}: {
  className: string;
  on: boolean;
  label: string;
  align: "left" | "right";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`icon-hover group/tip absolute z-10 flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-surface/90 text-ink transition-opacity focus-visible:opacity-100 ${className} ${
        on
          ? "opacity-100 ring-[1.5px] ring-ink"
          : "opacity-0 ring-1 ring-line group-hover/card:opacity-100 hover:ring-ink"
      }`}
    >
      {children}
      <HoverLabel text={label} align={align} below />
    </button>
  );
}

function StripButton({
  active,
  label,
  onClick,
  className,
  align,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  className: string;
  align: "left" | "center" | "right";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`icon-hover group/tip relative flex h-[30px] items-center rounded-sm transition-colors ${className} ${
        active ? "bg-ink text-cream" : "text-muted hover:bg-ink/5 hover:text-ink"
      }`}
    >
      {children}
      <HoverLabel text={label} align={align} />
    </button>
  );
}
