"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TopBar from "@/components/TopBar";
import PlayerModal, { type ProgressUpdate } from "@/components/PlayerModal";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import Spinner from "@/components/ui/Spinner";
import { useDismiss } from "@/components/ui/useDismiss";
import { Thumb } from "@/components/ui/Media";
import SearchField from "@/components/ui/SearchField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { timeAgo } from "@/lib/format";
import { api, rememberedReply } from "@/lib/api-client";
import { notifyNavChanged } from "@/lib/nav-events";
import type { Answer, FeedVideo, GenreItem } from "@/components/types";
import { CopyAllItem, Dropdown } from "./ListControls";
import { videoMarkdown, type Entry } from "./model";
import NotebookReader from "./NotebookReader";

type TypeFilter = "all" | "answers" | "notes";

/** A question shows up in the question filter once you've asked it this many times. */
const QUESTION_MIN_USES = 2;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const latest = (a: string, b: string | null) => (b && b > a ? b : a);

/**
 * The Notebook: every saved answer and note, by video. A list on the left
 * (filters on top), a reader on the right showing the chosen video in full,
 * where you can ask a follow-up or write your note. Everything loads in one
 * request and filters in the browser — instant at personal scale.
 */
export default function NotebookClient() {
  // Coming back to the Notebook starts from the copy remembered in this tab
  // (instant), then refreshes (see lib/api-client.ts).
  const [seen] = useState(() => rememberedReply("/api/notebook"));
  const [genres, setGenres] = useState<GenreItem[]>(() => rememberedReply("/api/genres")?.genres ?? []);
  // The API sends newest first; a video's answers read oldest first.
  const [answers, setAnswers] = useState<Answer[]>(() => [...(seen?.answers ?? [])].reverse());
  const [videos, setVideos] = useState<FeedVideo[]>(seen?.videos ?? []);
  const [loading, setLoading] = useState(!seen);
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
      api("/api/notebook", { fallback: "Couldn't load the notebook" }),
      // Genres only label things; a failure here mustn't hide the notebook.
      api("/api/genres").catch(() => ({})),
    ])
      .then(([nb, g]) => {
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
      // A failed refresh keeps the remembered copy on screen; the error only
      // shows when there's nothing to show.
      .catch((err) => !seen && setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [seen]);

  // Close the ⋯ menu on an outside click or Esc.
  useDismiss(menuOpen, () => setMenuOpen(false));

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
            <div className="relative" data-menu>
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
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search answers, notes, titles"
          label="Search the notebook"
        />
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
                <Thumb src={e.video.thumbnail} lazy className="w-20 shrink-0 self-start rounded-xs" />
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
        <EmptyState title="Your notebook is empty" note="every answer you keep lands here" className="mt-10">
          Ask about any video, or write a note on it. Every answer and note is kept here, by video.
        </EmptyState>
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
              <NotebookReader
                key={selected.video.id}
                entry={selected}
                genre={genres.find((g) => g.id === selected.video.genreId) ?? null}
                isMatch={(a) => (questionFilter || query ? answerMatches(a) : false)}
                onWatch={setPlaying}
                onAnswer={addAnswer}
                onNoteSaved={(note, at) => patchVideo(selected.video.id, { personalNote: note, personalNoteAt: at })}
              />
            ) : (
              <EmptyState title="No matches" action={<Button onClick={clearFilters}>Clear filters</Button>}>
                Nothing in your notebook matches these filters.
              </EmptyState>
            )}
          </main>
        </div>
      )}

      {playing && <PlayerModal video={playing} onClose={closePlayer} onProgress={handleProgress} />}
    </>
  );
}
