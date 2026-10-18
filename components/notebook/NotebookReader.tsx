import { useRef, useState } from "react";
import CopyButton from "@/components/CopyButton";
import Markdown from "@/components/Markdown";
import NoteEditor from "@/components/NoteEditor";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Spinner from "@/components/ui/Spinner";
import { useCopy } from "@/components/ui/useCopy";
import type { Answer, FeedVideo, GenreItem } from "@/components/types";
import { useAsk } from "@/components/useAsk";
import { formatDuration, timeAgo } from "@/lib/format";
import { videoMarkdown, type Entry } from "./model";

/** The right-hand side: one video, all its answers, a follow-up box, your note. */
export default function NotebookReader({
  entry,
  genre,
  isMatch,
  onWatch,
  onAnswer,
  onNoteSaved,
}: {
  entry: Entry;
  genre: GenreItem | null;
  /** True for answers that match the active question filter or search. */
  isMatch: (a: Answer) => boolean;
  onWatch: (v: FeedVideo) => void;
  onAnswer: (a: Answer) => void;
  onNoteSaved: (note: string | null, at: string | null) => void;
}) {
  const { video, answers } = entry;
  const [editingNote, setEditingNote] = useState(false);
  const latestRef = useRef<HTMLDivElement>(null);
  const { question, setQuestion, pending, error: askError, ask, inputRef: askInputRef } = useAsk(video.id, (note) => {
    onAnswer(note);
    // Bring the new answer into view once it's rendered.
    setTimeout(() => latestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  });

  return (
    <article className="flex max-w-[820px] flex-col gap-5">
      {/* Title and actions */}
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-[240px] flex-1">
          <h2 className="font-display text-xl">{video.title}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-meta text-muted">
            {genre && (
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: genre.color }} />
            )}
            <span className="font-medium text-ink">{video.channelTitle}</span>
            {video.durationSeconds > 0 && <span>· <span className="font-mono">{formatDuration(video.durationSeconds)}</span></span>}
            <span>· updated {timeAgo(entry.lastActivity)}</span>
            {video.watched && <span>· seen</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <CopyMarkdownButton text={() => videoMarkdown(entry)} />
          <Button variant="primary" size="sm" className="h-9" onClick={() => onWatch(video)}>
            <Icon name="play" size={12} filled />
            {video.resumeSeconds ? "Resume" : "Watch"}
          </Button>
        </div>
      </header>

      {/* Answers, in the order asked */}
      {answers.map((a, i) => (
        <section
          key={a.id}
          ref={i === answers.length - 1 ? latestRef : undefined}
          className={`scroll-mt-20 overflow-hidden rounded-lg border border-line bg-surface ${
            isMatch(a) ? "border-l-4 border-l-primary" : ""
          }`}
        >
          <div className="flex items-start gap-2.5 border-b border-line px-4 py-3">
            <span className="mt-px rounded-xs bg-ink px-1.5 font-mono text-xs font-bold uppercase leading-5 text-cream">
              Gemini
            </span>
            <p className="min-w-0 flex-1 text-lg font-semibold">{a.prompt.trim()}</p>
            <span className="shrink-0 pt-0.5 text-meta text-muted">{timeAgo(a.createdAt)}</span>
            <span className="shrink-0 pt-0.5">
              <CopyButton text={a.answer} quiet />
            </span>
          </div>
          <div className="max-w-[760px] px-5 py-4 text-lg leading-[1.65]">
            <Markdown text={a.answer} />
          </div>
        </section>
      ))}

      {pending && (
        <section className="rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-sm">
          <p className="font-semibold">{pending}</p>
          <Spinner label="Thinking…" size={14} className="mt-2 font-semibold" />
          <p className="mt-1 text-meta text-muted">A long video without captions can take a minute.</p>
        </section>
      )}

      {/* Follow-up */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex overflow-hidden rounded-md border-[1.5px] border-ink bg-surface focus-within-ring"
      >
        <span className="flex items-center px-3 text-muted">
          <Icon name="ask" size={17} />
        </span>
        <input
          ref={askInputRef}
          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted"
          placeholder={answers.length ? "Ask a follow-up about this video" : "Ask anything about this video"}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Ask about this video"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={!!pending || !question.trim()}
          className="icon-hover m-1 flex w-10 items-center justify-center rounded-sm bg-primary disabled:opacity-40"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
      {askError && <p className="-mt-3 text-sm font-semibold text-danger">{askError}</p>}

      {/* Your note */}
      {editingNote ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 flex items-center">
            <NoteLabel />
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditingNote(false)}>
              Done
            </Button>
          </div>
          <NoteEditor videoId={video.id} initial={video.personalNote} autoFocus large rows={8} onSaved={onNoteSaved} />
        </section>
      ) : video.personalNote ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 flex items-center gap-3">
            <NoteLabel />
            <span className="ml-auto">
              <CopyButton text={video.personalNote} quiet />
            </span>
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="icon-hover flex items-center gap-1 text-meta font-semibold text-muted hover:text-ink"
            >
              <Icon name="note" size={13} />
              Edit
            </button>
          </div>
          <div className="whitespace-pre-wrap text-lg leading-relaxed">{video.personalNote}</div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setEditingNote(true)}
          className="icon-hover flex items-center gap-2.5 rounded-lg border border-dashed border-line px-4 py-3.5 text-left text-sm text-muted hover:border-ink hover:bg-surface hover:text-ink"
        >
          <Icon name="note" size={15} />
          Add your own note. It sits beside the answers and shows up in search.
        </button>
      )}
    </article>
  );
}

function NoteLabel() {
  return (
    <span className="rounded-xs bg-primary px-1.5 font-mono text-xs font-bold uppercase leading-5 text-ink">
      My note
    </span>
  );
}

/** "Copy as Markdown" for one video; builds the text only when clicked. */
function CopyMarkdownButton({ text }: { text: () => string }) {
  const { copied, copy } = useCopy();
  return (
    <Button size="sm" className="h-9" onClick={() => copy(text())}>
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : "Copy as Markdown"}
    </Button>
  );
}
