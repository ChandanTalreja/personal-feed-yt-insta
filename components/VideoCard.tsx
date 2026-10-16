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
 * One video in the feed. Triage lives on the thumbnail (✓ seen top-left,
 * bookmark top-right); studying lives in the strip under the title, and
 * every tool opens the study panel rather than a popup inside the card.
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
      className={`@container relative flex flex-col border-2 border-ink bg-surface transition-shadow ${
        selected
          ? "shadow-[5px_5px_0_var(--color-primary)]"
          : "shadow-hard hover:shadow-hard-lg"
      }`}
    >
      <button
        type="button"
        className={`relative block w-full cursor-pointer overflow-hidden border-b-2 border-ink bg-ink text-left ${
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
          <div className="aspect-video w-full bg-muted-2" />
        )}
        {video.durationSeconds > 0 && (
          <span className="absolute bottom-2 right-2 bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold text-cream">
            {formatDuration(video.durationSeconds)}
          </span>
        )}
        {(video.isShort || video.isLive) && (
          <span className="absolute bottom-2 left-2 border-2 border-ink bg-pink px-1.5 py-0.5 text-[10px] font-bold">
            {video.isLive ? "Stream" : "Short"}
          </span>
        )}
        {progressPct > 0 && (
          // How much has actually been played (sittings add up) — the same
          // numbers the 50% auto-watched rule uses.
          <span className="absolute inset-x-0 bottom-0 h-[5px] bg-faint" title={`${progressPct}% watched`}>
            <span className="block h-full bg-primary" style={{ width: `${progressPct}%` }} />
          </span>
        )}
      </button>

      {/* Corner toggles sit over the thumbnail but outside its button —
          a button can't contain another button. */}
      <CornerToggle
        className="left-2 top-2"
        on={video.watched}
        onClass="bg-ink text-cream"
        label={video.watched ? "Mark unseen" : "Mark seen"}
        align="left"
        onClick={() => onToggleWatched(video)}
      >
        <Icon name="check" size={17} strokeWidth={3} />
      </CornerToggle>
      <CornerToggle
        className="right-2 top-2"
        on={saved}
        onClass="bg-primary text-ink"
        label={saved ? "Remove from Later" : "Watch later"}
        align="right"
        onClick={() => onToggleLater(video)}
      >
        {/* A switch shows on/off by itself — no yellow fill, or every card
            would look saved. */}
        <Icon name="bookmark" size={16} filled={saved} duotone={false} />
      </CornerToggle>

      {/* Seen in place, with a way back — a misclick costs nothing. */}
      {dimmed && (
        <div className="absolute left-[46px] top-2.5 flex items-center gap-2 bg-ink px-2 py-1 text-xs font-bold text-cream">
          Seen
          <button
            type="button"
            className="flex items-center gap-1 text-pink hover:underline"
            onClick={() => onToggleWatched(video)}
          >
            <Icon name="undo" size={13} />
            Undo
          </button>
        </div>
      )}

      <div className={`flex flex-col gap-2 px-3.5 py-3 ${dimmed ? "opacity-45" : ""}`}>
        <h3 className="line-clamp-2 min-h-[2.6em] text-[15px] font-bold leading-[1.3]" title={video.title}>
          {video.title}
        </h3>
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink/75">
          <span
            className="h-2.5 w-2.5 shrink-0 border-[1.5px] border-ink"
            style={{ backgroundColor: genreColor }}
          />
          <span className="truncate font-bold text-ink" title={video.channelTitle}>
            {video.channelTitle}
          </span>
          <span className="shrink-0 whitespace-nowrap">· {timeAgo(video.publishedAt)}</span>
        </div>
      </div>

      {/* Tool strip: Ask first (with its saved-answer count), then icons. */}
      <div className="mt-auto flex h-[38px] border-t-2 border-ink">
        <StripButton
          active={activeTool === "ask"}
          label="Ask about this video"
          onClick={() => onOpenTool(video, "ask")}
          className="min-w-0 flex-1 justify-start gap-1.5 px-2.5"
          idleClass="bg-panel"
          align="left"
        >
          <Icon name="ask" size={17} />
          <span className="hidden text-[13px] font-bold @min-[12rem]:inline">Ask</span>
          {video.answerCount > 0 && (
            <span className="absolute right-1 top-1 bg-primary px-1 font-mono text-[10px] font-bold leading-[14px] text-ink">
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
            className="w-9 shrink-0 justify-center border-l-2 border-ink"
            align={i === all.length - 1 ? "right" : "center"}
          >
            <Icon name={icon} size={17} />
            {/* The dot means a note already exists. */}
            {tool === "note" && video.personalNote && (
              <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full bg-danger" />
            )}
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
      className={`pointer-events-none absolute z-30 hidden whitespace-nowrap bg-ink px-1.5 py-1 text-[10px] font-bold leading-none text-cream group-hover:block group-focus-visible:block ${anchor} ${
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
  onClass,
  label,
  align,
  onClick,
  children,
}: {
  className: string;
  on: boolean;
  onClass: string;
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
      className={`group absolute z-10 flex h-[30px] w-[30px] items-center justify-center border-2 border-ink ${className} ${
        on ? onClass : "bg-surface text-ink hover:bg-tint"
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
  idleClass = "",
  align,
  children,
}: {
  /** Background when not active (Ask is pale yellow: it's the main action). */
  idleClass?: string;
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
      className={`group relative flex items-center transition-colors ${className} ${
        active ? "bg-ink text-cream" : `text-ink hover:bg-primary ${idleClass}`
      }`}
    >
      {children}
      <HoverLabel text={label} align={align} />
    </button>
  );
}
