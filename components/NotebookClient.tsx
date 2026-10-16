"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Mascot from "./Mascot";
import CopyButton from "./CopyButton";
import NoteEditor from "./NoteEditor";
import Markdown from "./Markdown";
import PlayerModal, { type ProgressUpdate } from "./PlayerModal";
import { textColorFor } from "@/lib/color";
import { timeAgo } from "@/lib/format";
import type { FeedVideo, GenreItem } from "./types";

interface Answer {
  id: number;
  videoId: number;
  prompt: string;
  answer: string;
  createdAt: string;
}

interface Group {
  video: FeedVideo;
  answers: Answer[];
  /** Show this video's personal note (and its editor) in the block. */
  showNote: boolean;
  lastActivity: string;
}

type TypeFilter = "both" | "answers" | "notes";

/** A question becomes a filter chip once you've asked it this many times. */
const QUESTION_CHIP_MIN_USES = 2;
const MAX_QUESTION_CHIPS = 6;
/** Answers longer than this start collapsed. */
const COLLAPSE_AT_CHARS = 700;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const later = (a: string, b: string | null) => (b && b > a ? b : a);

export default function NotebookClient() {
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [genreFilter, setGenreFilter] = useState<number | "all">("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("both");
  const [questionFilter, setQuestionFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // The video whose note is open for editing (kept visible while editing,
  // even if the text is cleared mid-way).
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [playing, setPlaying] = useState<FeedVideo | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/notebook").then((r) => r.json()),
      fetch("/api/genres").then((r) => r.json()),
    ])
      .then(([nb, g]) => {
        if (nb.error) throw new Error(nb.error);
        setAnswers(nb.answers ?? []);
        setVideos(nb.videos ?? []);
        setGenres(g.genres ?? []);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const videoById = useMemo(
    () => new Map(videos.map((v) => [v.id, v])),
    [videos]
  );

  // Questions asked at least twice become chips, most-asked first.
  const questionChips = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const a of answers) {
      const key = normalize(a.prompt);
      const entry = byKey.get(key);
      if (entry) entry.count++;
      else byKey.set(key, { label: a.prompt.trim(), count: 1 });
    }
    return [...byKey.entries()]
      .filter(([, e]) => e.count >= QUESTION_CHIP_MIN_USES)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, MAX_QUESTION_CHIPS)
      .map(([key, e]) => ({ key, ...e }));
  }, [answers]);

  // Type + question + search build the video blocks; the genre chip then
  // picks among them (so genre counts reflect the other filters). Search
  // matches answer text, the question, the note, or the video/channel name —
  // a title/channel match shows everything for that video.
  const query = normalize(search);
  const groupsBeforeGenre = useMemo(() => {
    const matchesVideo = (v: FeedVideo) =>
      !query ||
      v.title.toLowerCase().includes(query) ||
      v.channelTitle.toLowerCase().includes(query);
    const groups = new Map<number, Group>();

    if (typeFilter !== "notes") {
      for (const a of answers) {
        const video = videoById.get(a.videoId);
        if (!video) continue;
        if (questionFilter && normalize(a.prompt) !== questionFilter) continue;
        if (
          query &&
          !matchesVideo(video) &&
          !a.answer.toLowerCase().includes(query) &&
          !a.prompt.toLowerCase().includes(query)
        ) {
          continue;
        }
        const g = groups.get(video.id);
        if (g) g.answers.push(a);
        else
          groups.set(video.id, {
            video,
            answers: [a],
            showNote: false,
            lastActivity: a.createdAt,
          });
      }
    }

    // Personal notes only appear without a question filter (that filter is
    // about Gemini's answers). A video already shown for its answers also
    // shows its note; a note-only video needs the note (or title) to match.
    if (typeFilter !== "answers" && !questionFilter) {
      for (const video of videos) {
        const hasNote = !!video.personalNote || editingNote === video.id;
        if (!hasNote) continue;
        const existing = groups.get(video.id);
        if (existing) {
          existing.showNote = true;
          existing.lastActivity = later(existing.lastActivity, video.personalNoteAt);
          continue;
        }
        const noteMatches =
          matchesVideo(video) ||
          (video.personalNote ?? "").toLowerCase().includes(query) ||
          editingNote === video.id;
        if (!noteMatches) continue;
        groups.set(video.id, {
          video,
          answers: [],
          showNote: true,
          lastActivity: video.personalNoteAt ?? new Date(0).toISOString(),
        });
      }
    }

    return [...groups.values()].sort((a, b) =>
      b.lastActivity.localeCompare(a.lastActivity)
    );
  }, [answers, videos, videoById, typeFilter, questionFilter, query, editingNote]);

  const visibleGroups =
    genreFilter === "all"
      ? groupsBeforeGenre
      : groupsBeforeGenre.filter((g) => g.video.genreId === genreFilter);
  const visibleAnswerCount = visibleGroups.reduce(
    (n, g) => n + g.answers.length,
    0
  );
  const visibleNoteCount = visibleGroups.filter(
    (g) => g.showNote && g.video.personalNote
  ).length;
  const filtering =
    genreFilter !== "all" ||
    typeFilter !== "both" ||
    questionFilter != null ||
    query !== "";
  const hasAnything =
    answers.length > 0 || videos.some((v) => v.personalNote);

  const genreFor = (video: FeedVideo) =>
    genres.find((g) => g.id === video.genreId) ?? null;

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setGenreFilter("all");
    setTypeFilter("both");
    setQuestionFilter(null);
    setSearch("");
  }

  function noteSaved(videoId: number, note: string | null, at: string | null) {
    setVideos((list) =>
      list.map((v) =>
        v.id === videoId ? { ...v, personalNote: note, personalNoteAt: at } : v
      )
    );
  }

  // "Copy all": everything currently shown, as one plain-text document.
  function copyAllText(): string {
    const heading = [
      "Notebook",
      genreFilter !== "all"
        ? genres.find((g) => g.id === genreFilter)?.name
        : null,
      typeFilter === "answers" ? "AI answers" : typeFilter === "notes" ? "My notes" : null,
      questionFilter
        ? questionChips.find((q) => q.key === questionFilter)?.label
        : null,
      query ? `"${search.trim()}"` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const blocks = visibleGroups.map((g) => {
      const parts = [
        `## ${g.video.title} — ${g.video.channelTitle}`,
        `https://youtu.be/${g.video.ytVideoId}`,
        ...g.answers.map((a) => `Q: ${a.prompt.trim()}\n\n${a.answer.trim()}`),
      ];
      if (g.showNote && g.video.personalNote) {
        parts.push(`My note:\n\n${g.video.personalNote.trim()}`);
      }
      return parts.join("\n\n");
    });
    return `# ${heading}\n\n${blocks.join("\n\n---\n\n")}\n`;
  }

  // Watching from the Notebook still records honest progress.
  const closePlayer = useCallback(() => setPlaying(null), []);
  function handleProgress(update: ProgressUpdate) {
    setVideos((list) =>
      list.map((v) => (v.id === update.id ? { ...v, ...update } : v))
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <header className="flex flex-wrap items-center gap-4 py-6">
        <Mascot size={64} />
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">NOTEBOOK</h1>
          <p className="text-sm font-semibold text-neutral-600">
            everything you&apos;ve asked and noted, in one place
          </p>
        </div>
        <Link href="/" className="nb-btn ml-auto rounded-lg px-4 py-2 text-sm">
          ← BACK TO FEED
        </Link>
      </header>

      {/* Search + totals + copy all */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="nb-input w-full max-w-md rounded-lg px-3 py-2 text-sm"
          placeholder="🔍 Search inside answers, notes, titles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search the notebook"
        />
        {filtering && (
          <button
            className="nb-chip rounded-full px-3 py-1 text-xs"
            onClick={clearFilters}
          >
            ✕ CLEAR
          </button>
        )}
        <span className="ml-auto text-sm font-bold text-neutral-600">
          {visibleGroups.length} video{visibleGroups.length === 1 ? "" : "s"} ·{" "}
          {visibleAnswerCount} answer{visibleAnswerCount === 1 ? "" : "s"} ·{" "}
          {visibleNoteCount} note{visibleNoteCount === 1 ? "" : "s"}
        </span>
        {visibleGroups.length > 0 && <CopyAllButton text={copyAllText} />}
      </div>

      {/* What to show */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["both", "BOTH"],
            ["answers", "💬 AI ANSWERS"],
            ["notes", "📝 MY NOTES"],
          ] as [TypeFilter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            className="nb-chip rounded-full px-3 py-1 text-xs"
            data-active={typeFilter === value}
            onClick={() => setTypeFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Genre chips — counts reflect the other filters. */}
      {groupsBeforeGenre.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className="nb-chip rounded-full px-3 py-1 text-xs"
            data-active={genreFilter === "all"}
            onClick={() => setGenreFilter("all")}
          >
            ALL <span className="opacity-60">{groupsBeforeGenre.length}</span>
          </button>
          {genres.map((g) => {
            const count = groupsBeforeGenre.filter(
              (x) => x.video.genreId === g.id
            ).length;
            if (count === 0) return null;
            const active = genreFilter === g.id;
            return (
              <button
                key={g.id}
                className="nb-chip rounded-full px-3 py-1 text-xs"
                data-active={active}
                style={
                  active
                    ? { backgroundColor: g.color, color: textColorFor(g.color) }
                    : undefined
                }
                onClick={() => setGenreFilter(g.id)}
              >
                {g.name.toUpperCase()} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Question chips — only questions asked at least twice; they filter
          Gemini's answers, so they hide on MY NOTES. */}
      {questionChips.length > 0 && typeFilter !== "notes" && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-neutral-600">QUESTION:</span>
          <button
            className="nb-chip rounded-full px-3 py-1 text-xs"
            data-active={questionFilter == null}
            onClick={() => setQuestionFilter(null)}
          >
            ANY
          </button>
          {questionChips.map((q) => (
            <button
              key={q.key}
              className="nb-chip rounded-full px-3 py-1 text-xs"
              data-active={questionFilter === q.key}
              onClick={() => setQuestionFilter(q.key)}
              title={q.label}
            >
              {q.label.length > 42 ? q.label.slice(0, 40) + "…" : q.label}{" "}
              <span className="opacity-60">{q.count}</span>
            </button>
          ))}
        </div>
      )}

      {loading && <p className="py-8 text-center font-bold">LOADING…</p>}
      {error && (
        <p className="py-8 text-center font-bold text-[var(--accent)]">{error}</p>
      )}

      {!loading && !error && !hasAnything && (
        <div className="nb mx-auto max-w-lg rounded-xl p-8 text-center">
          <p className="font-display text-xl">NOTHING HERE YET</p>
          <p className="mt-2 text-sm text-neutral-600">
            Use 💬 ASK or 📝 NOTE on any video. Every answer and note is saved
            and shows up here, grouped by video.
          </p>
        </div>
      )}

      {!loading && hasAnything && visibleGroups.length === 0 && (
        <div className="nb mx-auto max-w-lg rounded-xl p-8 text-center">
          <p className="font-display text-xl">NO MATCHES</p>
          <p className="mt-2 text-sm text-neutral-600">
            Nothing in your notebook matches these filters.
          </p>
          <button
            className="nb-btn mt-4 inline-block rounded-lg px-4 py-2 text-sm"
            onClick={clearFilters}
          >
            ✕ CLEAR FILTERS
          </button>
        </div>
      )}

      {/* One block per video, most recent activity first. */}
      <div className="flex flex-col gap-5">
        {visibleGroups.map(({ video, answers: list, showNote, lastActivity }) => {
          const genre = genreFor(video);
          const accent = genre?.color ?? "#FFC900";
          const editing = editingNote === video.id;
          // Offer "+ add a note" on answer blocks when notes are in view.
          const canAddNote =
            !showNote && typeFilter === "both" && !questionFilter;
          return (
            <section key={video.id} className="nb rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="relative w-28 shrink-0 overflow-hidden rounded-md border-2 border-[var(--ink)] bg-black"
                  onClick={() => setPlaying(video)}
                  aria-label={`Play ${video.title}`}
                  title="Watch"
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
                    <div className="aspect-video w-full bg-neutral-800" />
                  )}
                </button>
                <div className="min-w-48 flex-1">
                  <h2 className="font-bold leading-snug">{video.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className="rounded border border-[var(--ink)] px-1.5 py-0.5 font-semibold"
                      style={{
                        backgroundColor: accent,
                        color: textColorFor(accent),
                      }}
                    >
                      {video.channelTitle}
                    </span>
                    <span className="text-neutral-500">
                      updated {timeAgo(lastActivity)}
                      {list.length > 0 &&
                        ` · ${list.length} answer${list.length === 1 ? "" : "s"}`}
                      {video.watched ? " · ✓ seen" : ""}
                    </span>
                  </div>
                </div>
                <button
                  className="nb-chip shrink-0 rounded px-2.5 py-1 text-xs"
                  onClick={() => setPlaying(video)}
                >
                  ▶ WATCH
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-3">
                {list.map((a) => {
                  const long = a.answer.length > COLLAPSE_AT_CHARS;
                  const open = expanded.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className="rounded-lg border-2 border-[var(--ink)] bg-[var(--paper)] p-3 text-sm leading-relaxed"
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="font-bold">
                          <span className="mr-1.5 rounded-full border border-[var(--ink)] bg-[var(--pink)] px-1.5 text-[10px]">
                            AI ANSWER
                          </span>
                          Q: {a.prompt.trim()}
                        </p>
                        <CopyButton text={a.answer} />
                      </div>
                      <div
                        className={long && !open ? "max-h-56 overflow-hidden" : ""}
                      >
                        <Markdown text={a.answer} />
                      </div>
                      {long && (
                        <button
                          className="nb-chip mt-2 rounded px-2 py-0.5 text-[10px]"
                          onClick={() => toggleExpanded(a.id)}
                        >
                          {open ? "SHOW LESS ▴" : "SHOW ALL ▾"}
                        </button>
                      )}
                      <p className="mt-1 text-[10px] text-neutral-500">
                        asked {timeAgo(a.createdAt)}
                      </p>
                    </div>
                  );
                })}

                {/* Your note — read view, editor, or an "add" button. */}
                {(showNote || editing) && (
                  <div className="rounded-lg border-2 border-[var(--ink)] bg-[var(--paper)] p-3 text-sm leading-relaxed">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="font-bold">
                        <span className="rounded-full border border-[var(--ink)] bg-[var(--yellow)] px-1.5 text-[10px]">
                          MY NOTE
                        </span>
                      </p>
                      <div className="flex gap-1.5">
                        {!editing && video.personalNote && (
                          <CopyButton text={video.personalNote} />
                        )}
                        <button
                          className="nb-chip rounded px-1.5 py-0.5 text-[10px]"
                          onClick={() =>
                            setEditingNote(editing ? null : video.id)
                          }
                        >
                          {editing ? "DONE" : "✎ EDIT"}
                        </button>
                      </div>
                    </div>
                    {editing ? (
                      <NoteEditor
                        videoId={video.id}
                        initial={video.personalNote}
                        autoFocus
                        rows={5}
                        onSaved={(note, at) => noteSaved(video.id, note, at)}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {video.personalNote}
                      </div>
                    )}
                  </div>
                )}
                {canAddNote && !editing && (
                  <button
                    className="nb-chip self-start rounded px-2.5 py-1 text-xs"
                    onClick={() => setEditingNote(video.id)}
                  >
                    + ADD MY NOTE
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {playing && (
        <PlayerModal
          video={playing}
          onClose={closePlayer}
          onProgress={handleProgress}
        />
      )}
    </div>
  );
}

/** Like CopyButton, but builds its (possibly large) text only on click. */
function CopyAllButton({ text }: { text: () => string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context (https/localhost); ignore failures.
    }
  }
  return (
    <button className="nb-btn rounded-lg px-3 py-1.5 text-xs" onClick={copy}>
      {copied ? "COPIED ✓" : "⧉ COPY ALL"}
    </button>
  );
}
