"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatDuration, timeAgo } from "@/lib/format";
import { notifyNavChanged } from "@/lib/nav-events";
import CopyButton from "./CopyButton";
import Markdown from "./Markdown";
import NoteEditor from "./NoteEditor";
import TrackMenu from "./TrackMenu";
import Button from "./ui/Button";
import Icon from "./ui/Icon";
import SidePanel from "./ui/SidePanel";
import type { FeedVideo } from "./types";

export type StudyTab = "ask" | "summary" | "transcript" | "note";

interface Answer {
  id: number;
  prompt: string;
  answer: string;
  createdAt: string;
}

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
  const [answers, setAnswers] = useState<Answer[] | null>(null); // null = not loaded
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  // The newest exchange, so the panel can open at its question (a long
  // answer is read from the top, not landed on at its last line).
  const latestRef = useRef<HTMLDivElement>(null);

  // Each tab loads once, the first time it's shown.
  const started = useRef({ summary: false, transcript: false, ask: false });

  useEffect(() => {
    const id = video.id;
    if (tab === "ask" && !started.current.ask) {
      started.current.ask = true;
      fetch(`/api/videos/${id}/ask`)
        .then((r) => r.json())
        .then((d) => {
          // The API sends newest first; a conversation reads oldest first.
          const list: Answer[] = [...(d.notes ?? [])].reverse();
          setAnswers(list);
          onVideoChangeRef.current(id, { answerCount: list.length });
        })
        .catch(() => setAnswers([]));
    }
    if (tab === "summary" && !started.current.summary && !video.summary) {
      started.current.summary = true;
      setSummaryBusy(true);
      fetch(`/api/videos/${id}/summarize`, { method: "POST" })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Couldn't summarise this video");
          setSummary(data.summary);
          onVideoChangeRef.current(id, { summary: data.summary });
        })
        .catch((err) => setSummaryError((err as Error).message))
        .finally(() => setSummaryBusy(false));
    }
    if (tab === "transcript" && !started.current.transcript) {
      started.current.transcript = true;
      setTranscriptBusy(true);
      fetch(`/api/videos/${id}/transcript`, { method: "POST" })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Couldn't get the transcript");
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

  async function ask(prompt: string) {
    const text = prompt.trim();
    if (!text || pending) return;
    setPending(text);
    setAskError(null);
    try {
      const res = await fetch(`/api/videos/${video.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't answer that");
      // Asking the same question again returns the saved answer: move it to
      // the end of the conversation rather than showing it twice.
      const next = [...(answers ?? []).filter((a) => a.id !== data.note.id), data.note];
      setAnswers(next);
      setQuestion("");
      onVideoChange(video.id, { answerCount: next.length });
      notifyNavChanged();
    } catch (err) {
      setAskError((err as Error).message);
    } finally {
      setPending(null);
    }
  }

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
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt=""
              referrerPolicy="no-referrer"
              className="aspect-video w-[120px] shrink-0 border-2 border-ink object-cover"
            />
          ) : (
            <div className="aspect-video w-[120px] shrink-0 border-2 border-ink bg-muted-2" />
          )}
          <div className="min-w-0">
            <h2 className="line-clamp-3 text-[15px] font-bold leading-[1.3]">{video.title}</h2>
            <p className="mt-1.5 text-xs text-muted-2">
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
            className={trackOpen ? "bg-ink! text-cream!" : ""}
          >
            <Icon name="track" size={14} />
            Add to track
          </Button>
          {trackOpen && (
            <div className="w-full border-2 border-ink bg-cream p-2.5">
              <TrackMenu mode="toggle" videoId={video.id} />
            </div>
          )}
        </>
      }
      tabs={
        <div role="tablist" aria-label="Study tools" className="flex">
          {TABS.map(([value, label], i) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => onTab(value)}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-bold transition-colors ${
                i > 0 ? "border-l-2 border-ink" : ""
              } ${tab === value ? "bg-ink text-cream" : "hover:bg-tint"}`}
            >
              {label}
              {value === "ask" && answerCount > 0 && (
                <span className="bg-primary px-1 font-mono text-[10px] leading-[14px] text-ink">
                  {answerCount}
                </span>
              )}
              {value === "note" && video.personalNote && (
                <span className="h-[7px] w-[7px] rounded-full bg-danger" />
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
          {answers == null && <Muted>Loading answers…</Muted>}
          {answers?.length === 0 && !pending && (
            <div className="border-2 border-dashed border-muted p-4 text-sm leading-relaxed text-muted-2">
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
              <div className="border-2 border-ink bg-cream p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Label>Gemini · {timeAgo(a.createdAt)}</Label>
                  <span className="ml-auto">
                    <CopyButton text={a.answer} quiet />
                  </span>
                </div>
                <div className="text-sm leading-relaxed">
                  <Markdown text={a.answer} />
                </div>
              </div>
            </div>
          ))}
          {pending && (
            <div ref={latestRef} className="flex scroll-mt-4 flex-col gap-2">
              <Question>{pending}</Question>
              <div className="border-2 border-dashed border-ink bg-cream p-3 text-sm text-muted-2">
                Thinking… a long video without captions can take a minute.
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
          {summaryBusy && <Muted>Reading the video…</Muted>}
          {summaryError && <ErrorText>{summaryError}</ErrorText>}
          {summary && (
            <div className="text-[15px] leading-relaxed">
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
  busy,
  error,
  suggestions,
  hasEveryday,
}: {
  question: string;
  onQuestion: (q: string) => void;
  onAsk: (q: string) => void;
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
              className="border-2 border-ink bg-cream px-2.5 py-1.5 text-left text-[13px] font-medium hover:bg-tint disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {!hasEveryday && (
        <Link href="/channels#ask-suggestions" className="text-xs font-bold text-warn hover:underline">
          + Add your everyday questions
        </Link>
      )}
      <form
        className="flex border-2 border-ink bg-cream shadow-hard focus-within:shadow-[3px_3px_0_var(--color-primary)]"
        onSubmit={(e) => {
          e.preventDefault();
          onAsk(question);
        }}
      >
        <input
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
          className="flex w-[46px] items-center justify-center border-l-2 border-ink bg-primary disabled:opacity-50"
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
      <Muted>
        Fetching the transcript… a video without captions takes a minute, as
        Gemini listens to the whole thing.
      </Muted>
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
        <label className="flex h-[34px] flex-1 items-center gap-2 border-2 border-ink bg-cream px-2.5">
          <Icon name="search" size={14} className="text-muted-2" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            placeholder="Find in transcript"
            value={find}
            onChange={(e) => onFind(e.target.value)}
          />
        </label>
        <CopyButton text={text} quiet />
      </div>
      {term && (
        <p className="font-mono text-xs text-muted-2">
          {shown.length} {shown.length === 1 ? "passage" : "passages"} mention “{find.trim()}”
        </p>
      )}
      <div className="flex flex-col gap-2 text-sm leading-relaxed">
        {shown.map((p, i) => {
          // Caption lines start with their time, "[01:30] …": show it as a
          // column so the text lines up and times are easy to scan.
          const m = p.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*/);
          const body = m ? p.slice(m[0].length) : p;
          return (
            <p key={i} className="flex gap-3">
              {m && (
                <span className="w-12 shrink-0 font-mono text-xs font-bold leading-[1.75] text-warn">
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

/** Wrap each case-insensitive match of `term` in a yellow mark. */
function highlight(text: string, term: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, from)) {
    out.push(text.slice(from, at));
    out.push(
      <mark key={at} className="bg-primary text-ink">
        {text.slice(at, at + term.length)}
      </mark>
    );
    from = at + term.length;
  }
  out.push(text.slice(from));
  return out;
}

function Question({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] self-end bg-ink px-3 py-2 text-sm font-medium leading-snug text-cream">
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-display text-[10.5px] uppercase tracking-widest text-muted-2">
      {children}
    </span>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-2">{children}</p>;
}

function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm font-bold text-danger">{children}</p>;
}
