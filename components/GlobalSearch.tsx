"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import GeminiMark from "./ui/GeminiMark";
import { Avatar, Thumb } from "./ui/Media";
import { highlightLoose } from "./ui/highlight";
import SearchField from "./ui/SearchField";
import Spinner from "./ui/Spinner";
import { formatDuration, timeAgo } from "@/lib/format";

type Scope = "all" | "channels" | "videos" | "answers";

interface Results {
  query: string;
  channelsOnly: boolean;
  channels: { id: number; title: string; handle: string | null; thumbnail: string | null; videoCount: number; section?: string }[];
  videos: {
    id: number;
    title: string;
    thumbnail: string | null;
    durationSeconds: number;
    isShort: boolean;
    watched: boolean;
    publishedAt: string;
    channelTitle: string;
    section?: string;
  }[];
  answers: {
    kind: "answer" | "note";
    id: number;
    videoId: number;
    videoTitle: string;
    prompt: string | null;
    snippet: string;
    at: string;
  }[];
  sheets: {
    id: number;
    query: string;
    genreKey: string;
    genreName: string | null;
    questionCount: number;
    updatedAt: string;
  }[];
  totals: { channels: number; videos: number; answers: number };
}

/** Which page a channel or video opens on: the Feed or Podcasts (FEAT-14). */
const home = (section?: string) => (section === "podcasts" ? "/podcasts" : "/");

/** In "All", each group shows its first few; a scope tab shows them all. */
const ALL_LIMIT = { channels: 3, videos: 5, answers: 4 };

/** One row the keyboard can land on, and where it goes. */
interface Item {
  key: string;
  href: string;
  node: ReactNode;
}

/**
 * The top bar's search: one box that finds channels, videos, and your
 * answers and notes. ⌘K (Ctrl+K) jumps here from anywhere; ↑↓ move,
 * Enter opens, Tab changes scope, Esc closes. Starting with "@" searches
 * channels only.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [active, setActive] = useState(0);
  // Where the panel opens: just under the box (the bar is taller on phones,
  // where search has its own row), measured when it opens.
  const [panelTop, setPanelTop] = useState(64);
  const requestId = useRef(0);

  function openPanel() {
    const box = inputRef.current?.closest("label");
    if (box) setPanelTop(Math.round(box.getBoundingClientRect().bottom) + 6);
    setOpen(true);
  }

  // ⌘K / Ctrl+K from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        openPanel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ask the server once typing pauses; only the newest answer is shown.
  useEffect(() => {
    const term = q.trim();
    if (term.replace(/^@/, "").length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const id = ++requestId.current;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        if (id !== requestId.current) return;
        if (res.ok) {
          setResults(data);
          setActive(0);
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const term = results?.query ?? "";
  const effectiveScope: Scope = results?.channelsOnly ? "channels" : scope;
  const show = (s: Exclude<Scope, "all">) => effectiveScope === "all" || effectiveScope === s;
  const cap = (s: Exclude<Scope, "all">, n: number) => (effectiveScope === "all" ? Math.min(n, ALL_LIMIT[s]) : n);

  // Every row on screen, in order, so ↑↓ and Enter can walk them.
  const sections = useMemo(() => {
    if (!results) return [];
    const out: { title: string; more?: { label: string; href: string }; items: Item[] }[] = [];
    if (show("channels") && results.channels.length) {
      out.push({
        title: "CHANNELS",
        items: results.channels.slice(0, cap("channels", results.channels.length)).map((c) => ({
          key: `c${c.id}`,
          href: `${home(c.section)}?channel=${c.id}`,
          node: (
            <>
              <Avatar src={c.thumbnail} name={c.title} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{highlightLoose(c.title, term)}</span>
                <span className="block truncate text-meta text-muted">
                  {c.handle ? highlightLoose(c.handle, term) : null}
                  {c.handle ? " · " : ""}
                  {c.videoCount} videos
                </span>
              </span>
            </>
          ),
        })),
      });
    }
    if (show("videos") && results.videos.length) {
      out.push({
        title: "VIDEOS",
        more:
          results.totals.videos > 0
            ? // No number here: the feed shows videos and shorts separately, so
              // "see all 17" could land on 9 videos (+ 8 under Shorts).
              { label: `Show “${term}” in the feed →`, href: `/?q=${encodeURIComponent(term)}` }
            : undefined,
        items: results.videos.slice(0, cap("videos", results.videos.length)).map((v) => ({
          key: `v${v.id}`,
          href: `${home(v.section)}?video=${v.id}`,
          node: (
            <>
              <Thumb src={v.thumbnail} className="w-16 shrink-0 rounded-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{highlightLoose(v.title, term)}</span>
                <span className="block truncate text-meta text-muted">
                  {v.channelTitle} · {timeAgo(v.publishedAt)}
                  {v.durationSeconds > 0 && <> · <span className="font-mono">{formatDuration(v.durationSeconds)}</span></>}
                  {v.isShort && " · Short"}
                </span>
              </span>
              {v.watched && (
                <span className="shrink-0 rounded-xs bg-tile-green px-1.5 text-xs font-semibold leading-5">Seen</span>
              )}
            </>
          ),
        })),
      });
    }
    // Cheat sheets live in the Notebook: the heading and the "Notebook · …"
    // line say so, wherever they show up among the other results.
    if (show("answers") && results.sheets?.length) {
      out.push({
        title: "CHEAT SHEETS · IN YOUR NOTEBOOK",
        items: results.sheets.slice(0, cap("answers", results.sheets.length)).map((c) => ({
          key: `s${c.id}`,
          href: `/notebook?sheet=${c.id}`,
          node: (
            <>
              <span className="h-fit shrink-0 rounded-xs border border-ink px-1.5 font-mono text-xs font-bold uppercase leading-[18px]">
                SHEET
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {highlightLoose(`${c.query.charAt(0).toUpperCase()}${c.query.slice(1)}`, term)} cheat sheet
                </span>
                <span className="block truncate text-meta text-muted">
                  Notebook · {c.genreKey === "all" ? "All genres" : c.genreKey === "none" ? "No genre" : (c.genreName ?? "A removed genre")} ·{" "}
                  {c.questionCount}{" "}
                  question{c.questionCount === 1 ? "" : "s"} · {timeAgo(c.updatedAt)}
                </span>
              </span>
            </>
          ),
        })),
      });
    }
    if (show("answers") && results.answers.length) {
      out.push({
        title: "ANSWERS & NOTES",
        items: results.answers.slice(0, cap("answers", results.answers.length)).map((a) => ({
          key: `${a.kind}${a.id}`,
          href: `/notebook?v=${a.videoId}`,
          node: (
            <>
              <span
                className={`flex h-fit shrink-0 items-center gap-1 rounded-xs px-1.5 font-mono text-xs font-bold uppercase leading-5 ${
                  a.kind === "note" ? "bg-primary text-ink" : "bg-ink text-cream"
                }`}
              >
                {a.kind === "note" ? "NOTE" : <><GeminiMark size={11} />GEMINI</>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm">{highlightLoose(a.snippet, term)}</span>
                <span className="mt-0.5 block truncate text-meta text-muted">
                  {a.prompt ? `Q: ${a.prompt}` : "My note"} · {a.videoTitle}
                </span>
              </span>
            </>
          ),
        })),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, effectiveScope, term]);

  const items = sections.flatMap((s) => s.items);
  const typed = q.trim().replace(/^@/, "").length >= 2;

  function go(href: string) {
    setOpen(false);
    setQ("");
    setResults(null);
    inputRef.current?.blur();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active].href);
    } else if (e.key === "Tab" && open && results && !results.channelsOnly) {
      // Tab cycles the scope tabs instead of leaving the box.
      e.preventDefault();
      const order: Scope[] = ["all", "channels", "videos", "answers"];
      const i = order.indexOf(scope);
      setScope(order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]);
      setActive(0);
    }
  }

  const scopes: [Scope, string, number | null][] = [
    ["all", "All", results ? results.totals.channels + results.totals.videos + results.totals.answers : null],
    ["channels", "Channels", results?.totals.channels ?? null],
    ["videos", "Videos", results?.totals.videos ?? null],
    ["answers", "Answers & notes", results?.totals.answers ?? null],
  ];

  let index = -1; // running position across sections, for the active row
  return (
    <div className="relative">
      <SearchField
        inputRef={inputRef}
        value={q}
        onChange={(v) => {
          setQ(v);
          if (!open) openPanel();
        }}
        onFocus={openPanel}
        onKeyDown={onKeyDown}
        onClear={() => setQ("")} // empty the box without opening the panel
        escClears={false} // Esc closes the panel instead (onKeyDown)
        placeholder="Search everything"
        label="Search channels, videos, answers and notes"
        aria-expanded={open}
        role="combobox"
        aria-controls="global-search-results"
        hint={<kbd className="hidden rounded-xs border border-line px-1.5 font-mono text-xs text-muted sm:block">⌘K</kbd>}
        className="w-full md:w-56 xl:w-72"
      />

      {open && (
        <>
          {/* Dim the page; clicking it closes the search. */}
          <div
            className="fixed inset-x-0 bottom-0 z-30 bg-ink/25"
            style={{ top: panelTop - 6 }}
            onClick={() => setOpen(false)}
          />
          <div
            id="global-search-results"
            style={{ top: panelTop, maxHeight: `calc(100vh - ${panelTop + 16}px)` }}
            className="fixed left-1/2 z-50 flex w-[min(660px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border-[1.5px] border-ink bg-surface shadow-lift"
          >
            {typed && results && !results.channelsOnly && (
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2" role="tablist">
                {scopes.map(([s, label, n]) => (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={scope === s}
                    onMouseDown={(e) => e.preventDefault()} // keep focus in the box
                    onClick={() => {
                      setScope(s);
                      setActive(0);
                    }}
                    className={`flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-3 text-meta font-semibold ${
                      scope === s ? "bg-ink text-cream" : "text-muted hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    {label}
                    {n != null && <span className="font-mono text-xs font-normal opacity-75">{n}</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto pb-1">
              {!typed && (
                <p className="px-4 py-5 text-sm text-muted">
                  Search your channels, every video&apos;s title, and the answers and notes in your
                  Notebook. Start with <b className="text-ink">@</b> for channels only.
                </p>
              )}
              {typed && loading && !results && <Spinner label="Searching…" className="px-4 py-5 text-sm font-semibold text-muted" />}
              {typed && results && items.length === 0 && (
                <p className="px-4 py-5 text-sm text-muted">
                  Nothing matches “{results.query}”{effectiveScope !== "all" ? " here. Try All." : "."}
                </p>
              )}
              {sections.map((section, si) => (
                <div key={section.title} className={si > 0 ? "border-t border-line" : ""}>
                  <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
                    <span className="label-caps">{section.title}</span>
                    {section.more && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(section.more!.href)}
                        className="text-meta font-semibold text-ink hover:underline"
                      >
                        {section.more.label}
                      </button>
                    )}
                  </div>
                  {section.items.map((item) => {
                    index++;
                    const on = index === active;
                    const myIndex = index;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActive(myIndex)}
                        onClick={() => go(item.href)}
                        className={`flex w-full items-center gap-3 border-l-[3px] px-4 py-2 text-left ${
                          on ? "border-l-primary bg-ink/5" : "border-l-transparent"
                        }`}
                      >
                        {item.node}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="hidden shrink-0 gap-4 border-t border-line px-4 py-2 text-xs text-muted sm:flex">
              <span>↑↓ move</span>
              <span>↵ open</span>
              <span>Tab change scope</span>
              <span>Esc close</span>
              <span className="ml-auto">
                Start with <b className="text-ink">@</b> for channels only
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
