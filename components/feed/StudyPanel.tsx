"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatDuration, timeAgo } from "@/lib/format";
import CopyButton from "@/components/CopyButton";
import Markdown from "@/components/Markdown";
import NoteEditor from "@/components/NoteEditor";
import TrackMenu from "./TrackMenu";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { Thumb } from "@/components/ui/Media";
import { highlight } from "@/components/ui/highlight";
import SearchField from "@/components/ui/SearchField";
import Spinner from "@/components/ui/Spinner";
import SidePanel from "@/components/ui/SidePanel";
import type { Answer, FeedVideo } from "@/components/types";
import { useAsk } from "@/components/useAsk";
import { api, rememberedReply } from "@/lib/api-client";

export type StudyTab = "ask" | "summary" | "transcript" | "note";

interface Props {
  video: FeedVideo;
  tab: StudyTab;
  onTab: (tab: StudyTab) => void;
  trackOpen: boolean;
  onTrackOpen: (open: boolean) => void;
  /** The video's genre suggestion (e.g. Interview's question list). */
  genrePrompt: string | null;
  /** Your everyday suggestions, shown after the genre's. */
  everyday: string[];
  onClose: () => void;
  onWatch: (video: FeedVideo) => void;
  /** Tell the feed what changed (summary, answer count, note) so the card agrees. */
  onVideoChange: (id: number, patch: Partial<FeedVideo>) => void;
}

const TABS: [StudyTab, string][] = [
  ["ask", "Ask"],
  ["summary", "Summary"],
  ["transcript", "Transcript"],
  ["note", "Note"],
];

/**
 * Everything about studying one video, in one place on the right: Ask as a
 * conversation, the summary, the transcript and your note. The parent gives
 * it a `key` per video, so switching videos starts it fresh.
 *
 * Nothing here calls Gemini on its own: a tab only loads when you pick it,
 * and summaries, transcripts and answers are cached on the server, so
 * reopening is free.
 */
export default function StudyPanel({
  video,
  tab,
  onTab,
  trackOpen,
  onTrackOpen,
  genrePrompt,
  everyday,
  onClose,
  onWatch,
  onVideoChange,
}: Props) {
  // Latest callback without re-running effects when the parent re-renders.
  const onVideoChangeRef = useRef(onVideoChange);
  useEffect(() => {
    onVideoChangeRef.current = onVideoChange;
  });

  // --- Summary ---
  const [summary, setSummary] = useState<string | null>(video.summary);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // --- Transcript ---
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [find, setFind] = useState("");

  // --- Ask ---
  // null = not loaded. A video whose answers were loaded before in this tab
  // starts with them (instant); the Ask tab still fetches a fresh copy.
  const [answers, setAnswers] = useState<Answer[] | null>(() => {
    const seen = rememberedReply(`/api/videos/${video.id}/ask`);
    return seen ? [...(seen.notes ?? [])].reverse() : null;
  });
  // Ask. Asking the same question again returns the saved answer: move it to the
  // end of the conversation rather than showing it twice.
  const { question, setQuestion, pending, error: askError, ask, inputRef: askInputRef } = useAsk(video.id, (note) => {
    const next = [...(answers ?? []).filter((a) => a.id !== note.id), note];
    setAnswers(next);
    onVideoChange(video.id, { answerCount: next.length });
  });

  // The newest exchange, so the panel can open at its question (a long
  // answer is read from the top, not landed on at its last line).
  const latestRef = useRef<HTMLDivElement>(null);

  // Each tab loads once, the first time it's shown.
  const started = useRef({ summary: false, transcript: false, ask: false });

  useEffect(() => {
    const id = video.id;
    if (tab === "ask" && !started.current.ask) {
      started.current.ask = true;
      api(`/api/videos/${id}/ask`)
        .then((d) => {
          // The API sends newest first; a conversation reads oldest first.
          const list: Answer[] = [...(d.notes ?? [])].reverse();
          setAnswers(list);
          onVideoChangeRef.current(id, { answerCount: list.length });
        })
        .catch(() => setAnswers((current) => current ?? []));
    }
    if (tab === "summary" && !started.current.summary && !video.summary) {
      started.current.summary = true;
      setSummaryBusy(true);
      api(`/api/videos/${id}/summarize`, { method: "POST", fallback: "Couldn't summarise this video" })
        .then((data) => {
          setSummary(data.summary);
          onVideoChangeRef.current(id, { summary: data.summary });
        })
        .catch((err) => setSummaryError((err as Error).message))
        .finally(() => setSummaryBusy(false));
    }
    if (tab === "transcript" && !started.current.transcript) {
      started.current.transcript = true;
      setTranscriptBusy(true);
      api(`/api/videos/${id}/transcript`, { method: "POST", fallback: "Couldn't get the transcript" })
        .then((data) => {
          setTranscript(data.transcript);
        })
        .catch((err) => setTranscriptError((err as Error).message))
        .finally(() => setTranscriptBusy(false));
    }
  }, [tab, video.id, video.summary]);

  // Bring the newest exchange into view, like a chat.
  useEffect(() => {
    if (tab === "ask") latestRef.current?.scrollIntoView({ block: "start" });
  }, [tab, answers, pending]);

  // Genre suggestion first, then yours; no repeats.
  const suggestions = [genrePrompt, ...everyday]
    .filter((s): s is string => !!s)
    .filter((s, i, all) => all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);

  const answerCount = answers?.length ?? video.answerCount;

  return (
    <SidePanel
      onClose={onClose}
      header={
        <div className="flex gap-3.5">
          <Thumb src={video.thumbnail} fallback="bg-muted" className="w-[120px] shrink-0 rounded-sm" />
          <div className="min-w-0">
            <h2 className="line-clamp-3 text-lg font-semibold">{video.title}</h2>
            <p className="mt-1.5 text-meta text-muted">
              {video.channelTitle}
              {video.durationSeconds > 0 && (
                <> · <span className="font-mono">{formatDuration(video.durationSeconds)}</span></>
              )}{" "}
              · {timeAgo(video.publishedAt)}
            </p>
          </div>
        </div>
      }
      actions={
        <>
          <Button variant="primary" size="sm" onClick={() => onWatch(video)}>
            <Icon name="play" size={12} filled />
            {video.resumeSeconds ? "Resume" : "Watch"}
          </Button>
          <Button
            size="sm"
            onClick={() => onTrackOpen(!trackOpen)}
            aria-expanded={trackOpen}
            className={trackOpen ? "border-ink! bg-ink! text-cream!" : ""}
          >
            <Icon name="track" size={14} />
            Add to track
          </Button>
          {trackOpen && (
            <div className="w-full rounded-md border border-line bg-cream p-2.5">
              <TrackMenu mode="toggle" videoId={video.id} />
            </div>
          )}
        </>
      }
      tabs={
        <div role="tablist" aria-label="Study tools" className="flex px-2">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => onTab(value)}
              className={`-mb-px flex h-11 flex-1 items-center justify-center gap-1.5 border-b-2 text-meta font-semibold transition-colors ${
                tab === value ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
              {value === "ask" && answerCount > 0 && (
                <span className="rounded-xs bg-primary px-1 font-mono text-xs leading-4 text-ink">
                  {answerCount}
                </span>
              )}
              {value === "note" && video.personalNote && (
                <Icon name="note" size={14} lit />
              )}
            </button>
          ))}
        </div>
      }
      footer={
        tab === "ask" ? (
          <AskBox
            question={question}
            onQuestion={setQuestion}
            onAsk={ask}
            inputRef={askInputRef}
            busy={pending != null}
            error={askError}
            suggestions={suggestions}
            hasEveryday={everyday.length > 0}
          />
        ) : undefined
      }
    >
      {tab === "ask" && (
        <div className="flex flex-col gap-4">
          {answers == null && <Waiting label="Loading answers…" />}
          {answers?.length === 0 && !pending && (
            <div className="rounded-md border border-dashed border-line p-4 text-sm text-muted">
              No questions yet. Ask anything below; answers are saved to your
              Notebook automatically.
            </div>
          )}
          {answers?.map((a, i) => (
            <div
              key={a.id}
              ref={!pending && i === answers.length - 1 ? latestRef : undefined}
              className="flex scroll-mt-4 flex-col gap-2"
            >
              <Question>{a.prompt}</Question>
              <div className="rounded-md border border-line bg-cream p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Label>Gemini · {timeAgo(a.createdAt)}</Label>
                  <span className="ml-auto">
                    <CopyButton text={a.answer} quiet />
                  </span>
                </div>
                <div className="text-sm">
                  <Markdown text={a.answer} />
                </div>
              </div>
            </div>
          ))}
          {pending && (
            <div ref={latestRef} className="flex scroll-mt-4 flex-col gap-2">
              <Question>{pending}</Question>
              <div className="rounded-md border border-dashed border-line bg-cream p-3">
                <Waiting label="Thinking…" note="A long video without captions can take a minute." />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "summary" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center">
            <Label>Summary</Label>
            {summary && (
              <span className="ml-auto">
                <CopyButton text={summary} quiet />
              </span>
            )}
          </div>
          {summaryBusy && <Waiting label="Reading the video…" />}
          {summaryError && <ErrorText>{summaryError}</ErrorText>}
          {summary && (
            <div className="text-lg leading-relaxed">
              <Markdown text={summary} />
            </div>
          )}
        </div>
      )}

      {tab === "transcript" && (
        <TranscriptView
          text={transcript}
          busy={transcriptBusy}
          error={transcriptError}
          find={find}
          onFind={setFind}
        />
      )}

      {tab === "note" && (
        <div className="flex flex-col gap-2">
          <Label>My note · saved automatically</Label>
          <NoteEditor
            videoId={video.id}
            initial={video.personalNote}
            autoFocus
            large
            rows={14}
            onSaved={(personalNote, personalNoteAt) =>
              onVideoChange(video.id, { personalNote, personalNoteAt })
            }
          />
        </div>
      )}
    </SidePanel>
  );
}

function AskBox({
  question,
  onQuestion,
  onAsk,
  inputRef,
  busy,
  error,
  suggestions,
  hasEveryday,
}: {
  question: string;
  onQuestion: (q: string) => void;
  onAsk: (q: string) => void;
  /** From useAsk: puts the cursor here (so dictation lands in the box). */
  inputRef: (el: HTMLInputElement | null) => void;
  busy: boolean;
  error: string | null;
  suggestions: string[];
  hasEveryday: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => onAsk(s)}
              className="rounded-sm border border-line bg-cream px-2.5 py-1.5 text-left text-meta font-medium hover:border-ink disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {!hasEveryday && (
        <Link href="/channels#ask-suggestions" className="text-meta font-semibold text-muted hover:text-ink hover:underline">
          + Add your everyday questions
        </Link>
      )}
      <form
        className="flex overflow-hidden rounded-md border-[1.5px] border-ink bg-cream focus-within-ring"
        onSubmit={(e) => {
          e.preventDefault();
          onAsk(question);
        }}
      >
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted"
          placeholder="Ask Gemini about this video…"
          value={question}
          onChange={(e) => onQuestion(e.target.value)}
          aria-label="Ask about this video"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          aria-label="Ask"
          className="icon-hover m-1 flex w-10 items-center justify-center rounded-sm bg-primary disabled:opacity-40"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

/**
 * The transcript, with a find box that narrows it to the passages that
 * mention a word. Captions arrive as lines; some sources send one long
 * paragraph, so that's split into sentences to keep "find" useful.
 */
function TranscriptView({
  text,
  busy,
  error,
  find,
  onFind,
}: {
  text: string | null;
  busy: boolean;
  error: string | null;
  find: string;
  onFind: (f: string) => void;
}) {
  if (busy) {
    return (
      <Waiting
        label="Fetching the transcript…"
        note="A video without captions takes a minute, as Gemini listens to the whole thing."
      />
    );
  }
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!text) return null;

  let passages = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (passages.length < 3) passages = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const term = find.trim().toLowerCase();
  const shown = term ? passages.filter((p) => p.toLowerCase().includes(term)) : passages;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SearchField
          value={find}
          onChange={onFind}
          placeholder="Find in transcript"
          label="Find in transcript"
          clearable={false}
          escClears={false}
          className="flex-1 bg-cream!"
        />
        <CopyButton text={text} quiet />
      </div>
      {term && (
        <p className="font-mono text-xs text-muted">
          {shown.length} {shown.length === 1 ? "passage" : "passages"} mention “{find.trim()}”
        </p>
      )}
      <div className="flex flex-col gap-2 text-sm">
        {shown.map((p, i) => {
          // Caption lines start with their time, "[01:30] …": show it as a
          // column so the text lines up and times are easy to scan.
          const m = p.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*/);
          const body = m ? p.slice(m[0].length) : p;
          return (
            <p key={i} className="flex gap-3">
              {m && (
                <span className="w-12 shrink-0 font-mono text-xs leading-[1.375rem] text-muted">
                  {m[1]}
                </span>
              )}
              <span>{term ? highlight(body, term) : body}</span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

function Question({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] self-end rounded-md rounded-br-xs bg-ink px-3 py-2 text-sm font-medium text-cream">
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="label-caps">
      {children}
    </span>
  );
}

/** The one waiting indicator, with an optional line of explanation. */
function Waiting({ label, note }: { label: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Spinner label={label} className="text-sm font-semibold" />
      {note && <p className="text-meta text-muted">{note}</p>}
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold text-danger">{children}</p>;
}
