"use client";

import { useEffect, useState } from "react";
import Markdown from "@/components/Markdown";
import Button from "@/components/ui/Button";
import GeminiMark from "@/components/ui/GeminiMark";
import Icon from "@/components/ui/Icon";
import Spinner from "@/components/ui/Spinner";
import type { CheatSheetItem, FeedVideo } from "@/components/types";
import { timeAgo } from "@/lib/format";
import { sheetMarkdown, sheetTitle } from "./model";
import { CopyMarkdownButton } from "./NotebookReader";

/** Links shown per question before "+N more". */
const SHOWN_VIDEOS = 3;

/**
 * A cheat sheet (FEAT-15) on the Notebook's right side: the unique
 * questions on a topic across your notes, most-asked first, each with its
 * short answer (when the notes had one) and the videos it came from.
 */
export default function CheatSheetView({
  sheet,
  genre,
  videosById,
  newLines,
  busy,
  error,
  onOpenVideo,
  onUpdate,
  onDelete,
}: {
  sheet: CheatSheetItem;
  /** "Interview", "All genres"… */
  genre: string;
  videosById: Map<number, FeedVideo>;
  /** Today's matching lines differ from the ones the sheet was made from:
   *  how many more there are now (0 = changed, not more). null = unchanged. */
  newLines: number | null;
  busy: boolean;
  error: string | null;
  onOpenVideo: (videoId: number) => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const title = (id: number) => videosById.get(id)?.title ?? null;

  return (
    <article className="flex max-w-[820px] flex-col gap-5">
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-[240px] flex-1">
          <h2 className="font-display text-xl">{sheetTitle(sheet.query)}</h2>
          <p className="mt-2 text-meta text-muted">
            <span className="font-medium text-ink">{genre}</span> · {sheet.questions.length} question
            {sheet.questions.length === 1 ? "" : "s"} · from {sheet.lineCount} matching line
            {sheet.lineCount === 1 ? "" : "s"} in {sheet.videoCount} video{sheet.videoCount === 1 ? "" : "s"} · updated{" "}
            {timeAgo(sheet.updatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <CopyMarkdownButton text={() => sheetMarkdown(sheet, title, genre)} />
          {/* The bin asks first, right here: a filled red Delete and a
              green Keep take its place. Red on hover, never yellow. */}
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="flex h-9 items-center gap-1.5 rounded-md bg-danger px-3 text-sm font-semibold text-white hover:brightness-110"
              >
                <Icon name="trash" size={14} />
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="h-9 rounded-md border border-ok bg-tile-green px-3 text-sm font-semibold text-ink hover:brightness-95"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete this cheat sheet"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-danger hover:text-danger"
            >
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      </header>

      {newLines != null && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-l-4 border-line border-l-primary bg-surface px-4 py-3 text-sm">
          <span className="flex-1">
            {newLines > 0
              ? `${newLines} new matching line${newLines === 1 ? "" : "s"} in your notes since this was made.`
              : "Your notes on this topic have changed since this was made."}
          </span>
          <Button size="sm" variant="primary" onClick={onUpdate} disabled={busy}>
            {busy ? <Spinner label="Updating…" size={13} /> : "Update"}
          </Button>
        </div>
      )}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <ol className="flex flex-col gap-3">
        {sheet.questions.map((q, i) => (
          <Question key={i} n={i + 1} q={q} title={title} onOpenVideo={onOpenVideo} />
        ))}
      </ol>
    </article>
  );
}

function Question({
  n,
  q,
  title,
  onOpenVideo,
}: {
  n: number;
  q: CheatSheetItem["questions"][number];
  title: (id: number) => string | null;
  onOpenVideo: (videoId: number) => void;
}) {
  const [all, setAll] = useState(false);
  // A video whose notes were deleted since has no title: leave it out.
  const videos = q.videoIds.filter((id) => title(id));
  const shown = all ? videos : videos.slice(0, SHOWN_VIDEOS);
  return (
    <li className="flex gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
      <span className="font-mono text-sm font-bold text-muted">{n}.</span>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold leading-snug">
          <Markdown text={q.question} />
        </div>
        {q.answer && (
          <div className="mt-1.5 text-sm leading-relaxed text-muted">
            <Markdown text={q.answer} />
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-meta">
          <span className="rounded-xs bg-primary px-1.5 font-semibold leading-5 text-ink">
            asked in {q.videoIds.length} video{q.videoIds.length === 1 ? "" : "s"}
          </span>
          {shown.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onOpenVideo(id)}
              title={title(id) ?? undefined}
              className="max-w-[260px] truncate rounded-xs border border-line px-1.5 leading-5 text-muted hover:border-ink hover:text-ink"
            >
              {title(id)}
            </button>
          ))}
          {videos.length > SHOWN_VIDEOS && (
            <button type="button" onClick={() => setAll((a) => !a)} className="font-semibold text-muted hover:text-ink hover:underline">
              {all ? "Show fewer" : `+${videos.length - SHOWN_VIDEOS} more`}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** How long each "what Gemini is doing" line stays before the next. */
const STEP_MS = 2200;

/**
 * While a sheet is being made: a turning Gemini sparkle and a line that
 * moves through what's happening (reading, spotting repeats, merging,
 * ordering), so the wait reads as work, not a stall.
 */
export function CheatSheetMaking({ query, lines, videos }: { query: string; lines: number; videos: number }) {
  const steps = [
    `reading ${lines} line${lines === 1 ? "" : "s"} from ${videos} video${videos === 1 ? "" : "s"}`,
    "spotting the questions that keep coming back",
    "folding the look-alikes into one",
    "putting the most-asked on top",
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((i) => Math.min(i + 1, 3)), STEP_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="flex max-w-[820px] flex-col gap-3 rounded-lg border border-dashed border-line bg-surface px-5 py-5">
      <p className="font-display text-xl">{sheetTitle(query)}</p>
      <p role="status" className="flex items-center gap-2.5 text-sm">
        <GeminiMark size={20} className="shrink-0 animate-[spin_2.4s_linear_infinite] motion-reduce:animate-none" />
        <span>
          <span className="font-semibold">Gemini</span> is {steps[step]}…
        </span>
      </p>
    </section>
  );
}
