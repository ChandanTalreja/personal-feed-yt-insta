"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import TopBar from "./TopBar";
import CopyButton from "./CopyButton";
import NoteEditor from "./NoteEditor";
import Markdown from "./Markdown";
import PlayerModal, { type ProgressUpdate } from "./PlayerModal";
import Button from "./ui/Button";
import Icon from "./ui/Icon";
import Spinner from "./ui/Spinner";
import SegmentedControl from "./ui/SegmentedControl";
import { formatDuration, timeAgo } from "@/lib/format";
import { notifyNavChanged } from "@/lib/nav-events";
import type { FeedVideo, GenreItem } from "./types";

interface Answer {
  id: number;
  videoId: number;
  prompt: string;
  answer: string;
  createdAt: string;
}

/** One video in the list: the video, its answers (oldest first), and when it was last touched. */
interface Entry {
  video: FeedVideo;
  answers: Answer[];
  lastActivity: string;
}

type TypeFilter = "all" | "answers" | "notes";

/** A question shows up in the question filter once you've asked it this many times. */
const QUESTION_MIN_USES = 2;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const latest = (a: string, b: string | null) => (b && b > a ? b : a);

/** One video as Markdown: title, link, every Q&A, your note. */
function videoMarkdown(e: Entry): string {
  const parts = [
    `## ${e.video.title} — ${e.video.channelTitle}`,
    `https://youtu.be/${e.video.ytVideoId}`,
    ...e.answers.map((a) => `**Q: ${a.prompt.trim()}**\n\n${a.answer.trim()}`),
  ];
  if (e.video.personalNote) parts.push(`**My note**\n\n${e.video.personalNote.trim()}`);
  return parts.join("\n\n");
}

/**
 * The Notebook: every saved answer and note, by video. A list on the left
 * (filters on top), a reader on the right showing the chosen video in full,
 * where you can ask a follow-up or write your note. Everything loads in one
 * request and filters in the browser — instant at personal scale.
 */
export default function NotebookClient() {
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [questionFilter, setQuestionFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Phones show the list or the reader, not both.
  const [reading, setReading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState<FeedVideo | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/notebook").then((r) => r.json()),
      fetch("/api/genres").then((r) => r.json()),
    ])
      .then(([nb, g]) => {
        if (nb.error) throw new Error(nb.error);
        // The API sends newest first; a video's answers read oldest first.
        setAnswers([...(nb.answers ?? [])].reverse());
        setVideos(nb.videos ?? []);
        setGenres(g.genres ?? []);
        // A link like /notebook?v=123 opens that video.
        const v = Number(new URLSearchParams(window.location.search).get("v"));
        if (v) {
          setSelectedId(v);
          setReading(true);
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Close the ⋯ menu on an outside click or Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest("[data-nb-menu]")) return;
      setMenuOpen(false);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  // Every video with something in it, newest activity first.
  const entries = useMemo(() => {
    const byVideo = new Map<number, Entry>();
    for (const video of videos) {
      byVideo.set(video.id, {
        video,
        answers: [],
        lastActivity: video.personalNoteAt ?? new Date(0).toISOString(),
      });
    }
    for (const a of answers) {
      const e = byVideo.get(a.videoId);
      if (!e) continue;
      e.answers.push(a);
      e.lastActivity = latest(e.lastActivity, a.createdAt);
    }
    return [...byVideo.values()]
      .filter((e) => e.answers.length > 0 || e.video.personalNote)
      .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  }, [answers, videos]);

  // Questions asked at least twice, most-asked first.
  const questions = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const a of answers) {
      const key = normalize(a.prompt);
      const q = byKey.get(key);
      if (q) q.count++;
      else byKey.set(key, { label: a.prompt.trim(), count: 1 });
    }
    return [...byKey.entries()]
      .filter(([, q]) => q.count >= QUESTION_MIN_USES)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, q]) => ({ key, ...q }));
  }, [answers]);

  const query = normalize(search);

  /** Does this answer match the question filter and the search? */
  const answerMatches = useCallback(
    (a: Answer) =>
      (!questionFilter || normalize(a.prompt) === questionFilter) &&
      (!query || a.answer.toLowerCase().includes(query) || a.prompt.toLowerCase().includes(query)),
    [questionFilter, query]
  );

  // Everything except genre decides which videos qualify; genre then picks
  // among them, so each genre's count reflects the other filters.
  const beforeGenre = useMemo(
    () =>
      entries.filter((e) => {
        const v = e.video;
        const titleHit = !query || v.title.toLowerCase().includes(query) || v.channelTitle.toLowerCase().includes(query);
        const noteHit = !!v.personalNote && (!query || v.personalNote.toLowerCase().includes(query));
        const answerHit = e.answers.some(answerMatches);
        if (questionFilter) return answerHit; // a question is about answers
        if (typeFilter === "answers") return e.answers.length > 0 && (titleHit || answerHit);
        if (typeFilter === "notes") return !!v.personalNote && (titleHit || noteHit);
        return titleHit || noteHit || answerHit;
      }),
    [entries, query, questionFilter, typeFilter, answerMatches]
  );
  const visible =
    genreFilter === "all"
      ? beforeGenre
      : beforeGenre.filter((e) => String(e.video.genreId ?? "none") === genreFilter);

  // The open video: the chosen one if it's still listed, else the first.
  const selected = visible.find((e) => e.video.id === selectedId) ?? visible[0] ?? null;

  function select(id: number) {
    setSelectedId(id);
    setReading(true);
    // Keep the open video in the address, so it can be linked and reloaded.
    window.history.replaceState(null, "", `/notebook?v=${id}`);
    // Phones swap the list for the reader: start the reader at its top.
    if (window.innerWidth < 1024) window.scrollTo({ top: 0 });
  }

  const filtering = genreFilter !== "all" || typeFilter !== "all" || !!questionFilter || !!query;
  function clearFilters() {
    setGenreFilter("all");
    setTypeFilter("all");
    setQuestionFilter("");
    setSearch("");
  }

  const answerCount = visible.reduce((n, e) => n + e.answers.length, 0);
  const noteCount = visible.filter((e) => e.video.personalNote).length;
  const hasAnything = entries.length > 0;

  // ---------- Changes from the reader ----------

  function patchVideo(id: number, patch: Partial<FeedVideo>) {
    setVideos((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  function addAnswer(a: Answer) {
    // Asking the same thing twice returns the saved answer: don't list it twice.
    setAnswers((list) => [...list.filter((x) => x.id !== a.id), a]);
  }

  const closePlayer = useCallback(() => setPlaying(null), []);
  // Watching from the Notebook still records honest progress.
  function handleProgress(update: ProgressUpdate) {
    patchVideo(update.id, update);
    if (update.watched) notifyNavChanged();
  }

  const copyAll = () =>
    `# Notebook${filtering ? " (filtered)" : ""}\n\n${visible.map(videoMarkdown).join("\n\n---\n\n")}\n`;

  // ---------- Layout ----------

  const genreCount = (key: string) =>
    key === "all"
      ? beforeGenre.length
      : beforeGenre.filter((e) => String(e.video.genreId ?? "none") === key).length;

  const list = (
    <aside className="flex w-full flex-col border-line lg:sticky lg:top-[65px] lg:h-[calc(100vh-65px)] lg:w-[420px] lg:shrink-0 lg:border-r">
      <div className="flex flex-col gap-3 border-b border-line p-5">
        <div className="flex items-start gap-3">
          <div className="mb-1 flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-display">Notebook</h1>
            <span className="pen-note">every answer you kept</span>
          </div>
          {visible.length > 0 && (
            <div className="relative" data-nb-menu>
              <button
                type="button"
                aria-label="More"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                  menuOpen ? "border-ink bg-ink text-cream" : "border-line bg-surface text-muted hover:border-ink hover:text-ink"
                }`}
              >
                <Icon name="more" size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border-[1.5px] border-ink bg-surface p-1 shadow-sticker">
                  <CopyAllItem text={copyAll} count={visible.length} onDone={() => setMenuOpen(false)} />
                </div>
              )}
            </div>
          )}
        </div>
        <label className="nb-input flex h-9 items-center gap-2 px-3 focus-within:border-ink focus-within:shadow-[0_0_0_3px_rgb(255_208_43/0.45)]">
          <Icon name="search" size={15} className="text-muted" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            placeholder="Search answers, notes, titles"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearch("")}
            aria-label="Search the notebook"
          />
          {search && (
            <button type="button" aria-label="Clear search" className="text-muted hover:text-ink" onClick={() => setSearch("")}>
              <Icon name="x" size={14} />
            </button>
          )}
        </label>
        <div className="flex gap-2">
          <Dropdown
            label="Genre"
            value={genreFilter}
            onChange={setGenreFilter}
            options={[
              { value: "all", label: `All genres · ${genreCount("all")}` },
              ...genres
                .map((g) => ({ value: String(g.id), label: `${g.name} · ${genreCount(String(g.id))}`, n: genreCount(String(g.id)) }))
                .filter((o) => o.n > 0 || o.value === genreFilter),
              ...(genreCount("none") > 0 ? [{ value: "none", label: `No genre · ${genreCount("none")}` }] : []),
            ]}
            className="flex-1"
          />
          <Dropdown
            label="Question"
            value={questionFilter}
            onChange={setQuestionFilter}
            disabled={questions.length === 0}
            options={[
              { value: "", label: questions.length ? "Any question" : "No repeated questions yet" },
              ...questions.map((q) => ({ value: q.key, label: `Q: ${q.label} · ${q.count}` })),
            ]}
            className="flex-[1.2]"
          />
        </div>
        <div className="flex items-center gap-3">
          <SegmentedControl
            size="sm"
            label="Show"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "All" },
              { value: "answers", label: "Answers" },
              { value: "notes", label: "My notes" },
            ]}
          />
          <span className="ml-auto text-right font-mono text-xs text-muted">
            {visible.length} video{visible.length === 1 ? "" : "s"}
            <br />
            {answerCount} answer{answerCount === 1 ? "" : "s"} · {noteCount} note{noteCount === 1 ? "" : "s"}
          </span>
        </div>
        {filtering && (
          <button type="button" onClick={clearFilters} className="self-start text-meta font-semibold hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((e) => {
          const on = selected?.video.id === e.video.id;
          return (
            <li key={e.video.id}>
              <button
                type="button"
                onClick={() => select(e.video.id)}
                aria-current={on ? "true" : undefined}
                className={`flex w-full gap-3 border-b border-l-[3px] border-b-line px-5 py-3 text-left transition-colors ${
                  on ? "border-l-primary bg-surface" : "border-l-transparent hover:bg-ink/[0.03]"
                }`}
              >
                {e.video.thumbnail ? (
                  <img
                    src={e.video.thumbnail}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-video w-20 shrink-0 self-start rounded-xs object-cover"
                  />
                ) : (
                  <span className="aspect-video w-20 shrink-0 self-start rounded-xs bg-line" />
                )}
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 text-sm font-semibold">{e.video.title}</span>
                  <span className="truncate text-meta text-muted">
                    {e.video.channelTitle}
                    {e.answers.length > 0 && ` · ${e.answers.length} answer${e.answers.length === 1 ? "" : "s"}`}
                    {e.video.personalNote && " · note"} · {timeAgo(e.lastActivity)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );

  return (
    <>
      <TopBar flush />
      {loading && <Spinner label="Loading your notebook…" className="flex justify-center py-16 text-sm font-semibold text-muted" />}
      {error && <p className="py-16 text-center text-sm font-semibold text-danger">{error}</p>}

      {!loading && !error && !hasAnything && (
        <div className="mx-auto mt-10 max-w-lg rounded-lg border border-line bg-surface p-8 text-center">
          <p className="font-display text-xl">Your notebook is empty</p>
          <p className="pen-note mt-2">every answer you keep lands here</p>
          <p className="mt-2 text-sm text-muted">
            Ask about any video, or write a note on it. Every answer and note is kept here, by video.
          </p>
        </div>
      )}

      {!loading && !error && hasAnything && (
        <div className="flex flex-col lg:flex-row lg:items-start">
          {/* On wide screens the wrapper disappears (display: contents) so the
              list is a direct column of the row and can stay put (sticky). */}
          <div className={`${reading ? "hidden" : "block"} lg:contents`}>{list}</div>

          <main className={`${reading ? "block" : "hidden lg:block"} min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-8`}>
            <button
              type="button"
              onClick={() => setReading(false)}
              className="mb-4 flex items-center gap-1 text-sm font-semibold lg:hidden"
            >
              <Icon name="chev" size={14} className="rotate-90" />
              All videos
            </button>
            {selected ? (
              <Reader
                key={selected.video.id}
                entry={selected}
                genre={genres.find((g) => g.id === selected.video.genreId) ?? null}
                isMatch={(a) => (questionFilter || query ? answerMatches(a) : false)}
                onWatch={setPlaying}
                onAnswer={addAnswer}
                onNoteSaved={(note, at) => patchVideo(selected.video.id, { personalNote: note, personalNoteAt: at })}
              />
            ) : (
              <div className="mx-auto mt-6 max-w-lg rounded-lg border border-line bg-surface p-8 text-center">
                <p className="font-display text-xl">No matches</p>
                <p className="mt-2 text-sm text-muted">Nothing in your notebook matches these filters.</p>
                <Button className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            )}
          </main>
        </div>
      )}

      {playing && <PlayerModal video={playing} onClose={closePlayer} onProgress={handleProgress} />}
    </>
  );
}

/** The right-hand side: one video, all its answers, a follow-up box, your note. */
function Reader({
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
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const latestRef = useRef<HTMLDivElement>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!text || pending) return;
    setPending(text);
    setAskError(null);
    setQuestion(""); // sent: it shows below as "Thinking…"
    try {
      const res = await fetch(`/api/videos/${video.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't answer that");
      onAnswer(data.note);
      notifyNavChanged();
      // Bring the new answer into view once it's rendered.
      setTimeout(() => latestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setAskError((err as Error).message);
      setQuestion((q) => q || text); // give it back to fix or retry, unless something new was typed
    } finally {
      setPending(null);
    }
  }

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
        onSubmit={ask}
        className="flex overflow-hidden rounded-md border-[1.5px] border-ink bg-surface focus-within:shadow-[0_0_0_3px_rgb(255_208_43/0.45)]"
      >
        <span className="flex items-center px-3 text-muted">
          <Icon name="ask" size={17} />
        </span>
        <input
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

/** A native select dressed as a field: keyboard and screen readers come free. */
function Dropdown({
  label,
  value,
  onChange,
  options,
  disabled = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={`relative flex min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border pl-3 pr-8 text-meta font-semibold transition-colors disabled:cursor-default disabled:opacity-60 ${
          value && value !== "all" ? "border-ink bg-primary/35" : "border-line bg-surface hover:border-ink"
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chev" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </label>
  );
}

/** "Copy as Markdown" for one video; builds the text only when clicked. */
function CopyMarkdownButton({ text }: { text: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      className="h-9"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text());
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard needs a secure context (https/localhost); ignore failures.
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : "Copy as Markdown"}
    </Button>
  );
}

/** "Copy all shown" in the ⋯ menu. */
function CopyAllItem({ text, count, onDone }: { text: () => string; count: number; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <MenuItem
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text());
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            onDone();
          }, 900);
        } catch {
          onDone();
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : `Copy all ${count} shown, as Markdown`}
    </MenuItem>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-semibold hover:bg-ink/5"
    >
      {children}
    </button>
  );
}
