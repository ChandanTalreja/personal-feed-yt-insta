"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Icon from "./ui/Icon";
import { formatDuration, timeAgo } from "@/lib/format";

type Scope = "all" | "channels" | "videos" | "answers";

interface Results {
  query: string;
  channelsOnly: boolean;
  channels: { id: number; title: string; handle: string | null; thumbnail: string | null; videoCount: number }[];
  videos: {
    id: number;
    title: string;
    thumbnail: string | null;
    durationSeconds: number;
    isShort: boolean;
    watched: boolean;
    publishedAt: string;
    channelTitle: string;
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
  totals: { channels: number; videos: number; answers: number };
}

/** In "All", each group shows its first few; a scope tab shows them all. */
const ALL_LIMIT = { channels: 3, videos: 5, answers: 4 };

/** One row the keyboard can land on, and where it goes. */
interface Item {
  key: string;
  href: string;
  node: ReactNode;
}

/** Wrap every case-insensitive match of `term` in the highlight. */
function highlight(text: string, term: string): ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(t); at !== -1; at = lower.indexOf(t, from)) {
    out.push(text.slice(from, at));
    out.push(
      <mark key={at} className="bg-tint text-ink shadow-[inset_0_-2px_0_var(--color-primary)]">
        {text.slice(at, at + t.length)}
      </mark>
    );
    from = at + t.length;
  }
  out.push(text.slice(from));
  return out;
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
          href: `/?channel=${c.id}`,
          node: (
            <>
              {c.thumbnail ? (
                <img src={c.thumbnail} alt="" referrerPolicy="no-referrer" className="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-ink" />
              ) : (
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-line-2 text-[10px] font-bold">
                  {c.title.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{highlight(c.title, term)}</span>
                <span className="block truncate text-xs text-ink/70">
                  {c.handle ? highlight(c.handle, term) : null}
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
          href: `/?video=${v.id}`,
          node: (
            <>
              {v.thumbnail ? (
                <img src={v.thumbnail} alt="" referrerPolicy="no-referrer" className="aspect-video w-16 shrink-0 border-2 border-ink object-cover" />
              ) : (
                <span className="aspect-video w-16 shrink-0 border-2 border-ink bg-line" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{highlight(v.title, term)}</span>
                <span className="block truncate text-xs text-ink/70">
                  {v.channelTitle} · {timeAgo(v.publishedAt)}
                  {v.durationSeconds > 0 && <> · <span className="font-mono">{formatDuration(v.durationSeconds)}</span></>}
                  {v.isShort && " · Short"}
                </span>
              </span>
              {v.watched && (
                <span className="shrink-0 border-[1.5px] border-ink px-1.5 py-0.5 text-[11px] font-bold">Seen</span>
              )}
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
                className={`h-fit shrink-0 px-1.5 py-1 font-display text-[10px] leading-none tracking-widest ${
                  a.kind === "note" ? "bg-primary text-ink" : "bg-ink text-cream"
                }`}
              >
                {a.kind === "note" ? "NOTE" : "GEMINI"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[13.5px] leading-snug">{highlight(a.snippet, term)}</span>
                <span className="mt-0.5 block truncate text-xs text-ink/70">
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
      <label className="flex h-9 w-full items-center gap-2 border-2 border-ink bg-surface px-2.5 shadow-hard-sm sm:w-64">
        <Icon name="search" size={15} className="text-ink/70" />
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          placeholder="Search everything"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) openPanel();
          }}
          onFocus={openPanel}
          onKeyDown={onKeyDown}
          aria-label="Search channels, videos, answers and notes"
          aria-expanded={open}
          role="combobox"
          aria-controls="global-search-results"
        />
        {q ? (
          <button type="button" aria-label="Clear search" onClick={() => setQ("")}>
            <Icon name="x" size={14} />
          </button>
        ) : (
          <kbd className="hidden border-[1.5px] border-ink/40 px-1 font-mono text-[10px] text-ink/60 sm:block">⌘K</kbd>
        )}
      </label>

      {open && (
        <>
          {/* Dim the page; clicking it closes the search. */}
          <div
            className="fixed inset-x-0 bottom-0 z-30 bg-ink/35"
            style={{ top: panelTop - 6 }}
            onClick={() => setOpen(false)}
          />
          <div
            id="global-search-results"
            style={{ top: panelTop, maxHeight: `calc(100vh - ${panelTop + 16}px)` }}
            className="fixed left-1/2 z-50 flex w-[min(660px,calc(100vw-24px))] -translate-x-1/2 flex-col border-2 border-ink bg-surface shadow-[6px_6px_0_var(--color-ink)]"
          >
            {typed && results && !results.channelsOnly && (
              <div className="flex shrink-0 overflow-x-auto border-b-2 border-ink" role="tablist">
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
                    className={`flex shrink-0 items-center gap-1.5 border-r-2 border-ink px-3.5 py-2.5 text-[13px] font-bold ${
                      scope === s ? "bg-ink text-cream" : "hover:bg-tint"
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
                <p className="px-4 py-5 text-sm text-ink/75">
                  Search your channels, every video&apos;s title, and the answers and notes in your
                  Notebook. Start with <b className="text-ink">@</b> for channels only.
                </p>
              )}
              {typed && loading && !results && <p className="px-4 py-5 text-sm font-bold text-ink/70">Searching…</p>}
              {typed && results && items.length === 0 && (
                <p className="px-4 py-5 text-sm text-ink/75">
                  Nothing matches “{results.query}”{effectiveScope !== "all" ? " here. Try All." : "."}
                </p>
              )}
              {sections.map((section, si) => (
                <div key={section.title} className={si > 0 ? "border-t-2 border-line-2" : ""}>
                  <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
                    <span className="font-display text-[10.5px] tracking-widest text-ink/75">{section.title}</span>
                    {section.more && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(section.more!.href)}
                        className="text-xs font-bold text-warn hover:underline"
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
                        className={`flex w-full items-center gap-3 border-l-4 px-4 py-2 text-left ${
                          on ? "border-l-primary bg-tint" : "border-l-transparent"
                        }`}
                      >
                        {item.node}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="hidden shrink-0 gap-4 border-t-2 border-ink px-4 py-2 text-xs text-ink/70 sm:flex">
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
