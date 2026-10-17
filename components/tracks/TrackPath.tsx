import { useEffect, useRef } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import IconButton from "@/components/ui/IconButton";
import { Thumb } from "@/components/ui/Media";
import type { FeedVideo, GenreItem } from "@/components/types";
import { formatDuration, formatTotalTime } from "@/lib/format";
import { coveredRatio } from "@/lib/progress";
import type { TrackDetail, TrackSummary, TrackVideo } from "./model";

/** Above this many videos the block bar would be slivers; a plain bar reads better. */
const MAX_BLOCKS = 60;

/** The right-hand side: one track as a path. */
export default function TrackPath({
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
          <p className="flex items-center gap-1.5 label-caps">
            {genre && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: genre.color }} />}
            Track{genre ? ` · ${genre.name}` : ""}
          </p>
          {renaming == null ? (
            <h2 className="mt-2 font-display text-display">{detail.track.name}</h2>
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
          <span className="mr-2 text-right font-mono text-meta font-bold">
            {done} of {videos.length} done
            {videos.length > 0 && (
              <>
                <br />
                <span className="font-normal text-muted">
                  {done === videos.length ? formatTotalTime(summary.totalSeconds) + " in total" : `${formatTotalTime(remaining)} left`}
                </span>
              </>
            )}
          </span>
          <IconButton label="Rename" tipBelow className="h-9 min-w-9" onClick={() => onRenaming(detail.track.name)}>
            <Icon name="pencil" size={16} />
          </IconButton>
          <IconButton label="Delete track" align="right" tipBelow className="h-9 min-w-9" onClick={() => onConfirmDelete(true)}>
            <Icon name="trash" size={16} />
          </IconButton>
        </div>
      </header>

      {confirmDelete && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-ink px-4 py-3 text-sm text-cream">
          <span className="flex-1">
            <strong>Delete “{detail.track.name}”?</strong> Its {videos.length} video
            {videos.length === 1 ? "" : "s"} stay in your feed; only the track goes.
          </span>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="h-8 rounded-sm bg-danger px-3 text-meta font-semibold text-white hover:brightness-110"
          >
            Delete track
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(false)}
            className="h-8 rounded-sm border border-cream/40 px-3 text-meta font-semibold hover:bg-cream hover:text-ink"
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
                className={`h-2.5 flex-1 rounded-xs ${
                  v.watched ? "bg-ink" : i === nextIndex ? "bg-primary ring-1 ring-ink" : "bg-line"
                }`}
              />
            ))}
          </div>
        ) : (
          <div className="h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${done} of ${videos.length} done`}>
            <div className="h-full rounded-full bg-ink" style={{ width: `${(done / videos.length) * 100}%` }} />
          </div>
        ))}

      {/* Up next */}
      {next ? (
        <section className="flex flex-wrap items-center gap-5 rounded-lg border border-line bg-surface p-4">
          <button
            type="button"
            onClick={() => onPlay(next)}
            aria-label={`Play ${next.title}`}
            className="relative w-[220px] max-w-full shrink-0 overflow-hidden rounded-md bg-ink"
          >
            <Thumb src={next.thumbnail} fallback="" className="w-full" />
            <ProgressStrip video={next} />
          </button>
          <div className="flex min-w-[200px] flex-1 flex-col gap-2">
            <span className="label-caps">Up next · step {nextIndex + 1}</span>
            <span className="text-xl font-bold">{next.title}</span>
            <span className="text-meta text-muted">
              {next.channelTitle}
              {next.durationSeconds > 0 && <> · <span className="font-mono">{formatDuration(next.durationSeconds)}</span></>}
              {next.resumeSeconds ? <> · resumes at <span className="font-mono">{formatDuration(next.resumeSeconds)}</span></> : null}
            </span>
          </div>
          <Button variant="primary" onClick={() => onPlay(next)}>
            <Icon name="play" size={13} filled />
            {next.resumeSeconds ? "Resume" : "Continue"}
          </Button>
        </section>
      ) : videos.length > 0 ? (
        <section className="rounded-lg border border-line bg-surface p-5">
          <p className="font-display text-xl">Track complete</p>
          <p className="mt-1 text-sm text-muted">
            All {videos.length} watched. Rewatch any step below, or add more videos from the feed.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">
          <p className="font-display text-lg text-ink">This track is empty</p>
          <p className="mt-1">
            Add videos from the feed: the track button on any card, or search a topic and add all the
            results in upload order.
          </p>
        </section>
      )}

      {/* The path, in order */}
      {videos.length > 0 && (
        // No overflow-hidden here: it would clip the steps' hover labels.
        <ol className="rounded-lg border border-line bg-surface">
          {videos.map((v, i) => {
            const isNext = i === nextIndex;
            const pct = Math.round(coveredRatio(v.watchProgress, v.durationSeconds) * 100);
            return (
              <li
                key={v.id}
                className={`group flex items-center gap-4 border-t border-line px-4 py-2.5 first:rounded-t-[9px] first:border-t-0 last:rounded-b-[9px] ${
                  isNext ? "bg-primary/15" : "hover:bg-ink/[0.03]"
                }`}
              >
                <span
                  className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                    v.watched ? "bg-ink text-cream" : isNext ? "bg-primary ring-1 ring-ink" : "bg-line text-muted"
                  }`}
                >
                  {v.watched ? <Icon name="check" size={13} /> : i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onPlay(v)}
                  className={`min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline ${
                    v.watched ? "text-muted" : ""
                  }`}
                  title={`Play ${v.title}`}
                >
                  {v.title}
                </button>
                <span className="hidden w-36 truncate text-meta text-muted md:block">{v.channelTitle}</span>
                <span className="hidden w-20 text-meta text-muted sm:block">
                  {v.answerCount > 0 ? `${v.answerCount} answer${v.answerCount === 1 ? "" : "s"}` : ""}
                </span>
                <span className="w-14 text-right font-mono text-xs">
                  {!v.watched && pct > 0 ? <span className="font-bold">{pct}%</span> : <span className="text-muted">{formatDuration(v.durationSeconds)}</span>}
                </span>
                {/* Reorder and remove: on hover (always visible on touch screens). */}
                <span className="flex gap-1 opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
                  <StepButton label="Move up" disabled={busy || i === 0} onClick={() => onMove(v, "up")}>
                    <Icon name="chevUp" size={13} />
                  </StepButton>
                  <StepButton label="Move down" disabled={busy || i === videos.length - 1} onClick={() => onMove(v, "down")}>
                    <Icon name="chev" size={13} />
                  </StepButton>
                  <StepButton label="Remove from track" disabled={busy} onClick={() => onRemove(v)}>
                    <Icon name="x" size={13} />
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
      className="field min-w-0 flex-1 px-3 py-1.5 font-display text-xl"
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
    <span className="absolute inset-x-0 bottom-0 h-[5px] bg-ink/55">
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
    <IconButton label={label} align="right" ghost onClick={onClick} disabled={disabled} className="h-7 min-w-7 disabled:opacity-25">
      {children}
    </IconButton>
  );
}
