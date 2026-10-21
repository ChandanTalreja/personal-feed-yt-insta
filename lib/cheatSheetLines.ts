import { looseMatcher } from "./looseMatch";

// Cheat sheets (FEAT-15), part 1: which lines of your notes go to Gemini.
// Pure code, no database or network: the server runs it to build a sheet,
// and the browser runs the same rules to notice "new matching lines since".

/** One question on a sheet, as saved. */
export interface CheatSheetQuestion {
  question: string;
  /** A short answer, only when the notes contained one. */
  answer: string | null;
  /** The videos it was asked in (most-asked questions come first). */
  videoIds: number[];
}

/** Text to search: a saved Gemini answer (markdown) or your own note (plain). */
export interface LineSource {
  videoId: number;
  text: string;
  kind: "answer" | "note";
}

/** An excerpt for Gemini, with every video it appeared in. */
export interface CheatSheetLine {
  text: string;
  videoIds: number[];
}

/** Past these, the sheet asks you to narrow the search instead of sending. */
export const MAX_LINES = 400;
export const MAX_CHARS = 40_000;

const ITEM_CHARS = 300; // one question
const DETAIL_CHARS = 200; // one sub-point (often "Solution: …")
const MAX_DETAILS = 4;
const MAX_HEADING_ITEMS = 25;

interface Item {
  text: string;
  details: string[];
}
interface Block {
  heading: string | null;
  items: Item[];
  /** Lines that are neither headings nor list items. */
  plain: string[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// Bold markers only cost tokens; Gemini reads the words the same.
const tidy = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/**
 * Splits a note into blocks: a heading and the list items under it. In the
 * saved answers a heading is a `#` line or a line that is only **bold**; in
 * your own notes, also a line ending in ":". An indented list item is a
 * detail of the item above it (usually its answer).
 */
function parse(text: string, kind: LineSource["kind"]): Block[] {
  const blocks: Block[] = [{ heading: null, items: [], plain: [] }];
  const block = () => blocks[blocks.length - 1];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, "    ");
    const trimmed = line.trim();
    if (!trimmed) continue;
    const heading =
      /^#{1,6}\s+(.+)$/.exec(trimmed)?.[1] ??
      /^\*\*([^*]+)\*\*:?$/.exec(trimmed)?.[1] ??
      (kind === "note" && /^[^-*•\d].*:$/.test(trimmed) ? trimmed : undefined);
    if (heading) {
      blocks.push({ heading: tidy(heading), items: [], plain: [] });
      continue;
    }
    const item = /^(\s*)(?:[*\-+•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const nested = item[1].length >= 2 && block().items.length > 0;
      if (nested) block().items[block().items.length - 1].details.push(tidy(item[2]));
      else block().items.push({ text: tidy(item[2]), details: [] });
      continue;
    }
    block().plain.push(tidy(trimmed));
  }
  return blocks;
}

function itemText(item: Item): string {
  const details = item.details.slice(0, MAX_DETAILS).map((d) => `\n  - ${clip(d, DETAIL_CHARS)}`);
  return `- ${clip(item.text, ITEM_CHARS)}${details.join("")}`;
}

/**
 * The excerpts about `query` across the given notes, deduplicated:
 * - a matching heading brings every item under it (a "HashMap internals"
 *   section brings its questions even when they don't say "hash map");
 * - a matching item (or one of its sub-points) brings that item with its
 *   sub-points, so a question's short answer comes along;
 * - a matching plain line brings itself.
 * Matching is the Notebook search's loose match ("hash map" = "HashMap").
 */
export function collectLines(sources: LineSource[], query: string): CheatSheetLine[] {
  const hit = looseMatcher(query);
  if (!hit) return [];
  const byText = new Map<string, Set<number>>();
  const add = (text: string, videoId: number) => {
    const ids = byText.get(text) ?? new Set<number>();
    ids.add(videoId);
    byText.set(text, ids);
  };
  for (const source of sources) {
    if (!hit(source.text)) continue; // most notes don't mention it at all
    for (const b of parse(source.text, source.kind)) {
      if (b.heading && hit(b.heading)) {
        const items = b.items.slice(0, MAX_HEADING_ITEMS).map(itemText);
        if (items.length) add(`## ${clip(b.heading, ITEM_CHARS)}\n${items.join("\n")}`, source.videoId);
        else add(`- ${clip(b.heading, ITEM_CHARS)}`, source.videoId);
        continue;
      }
      for (const item of b.items) {
        if (hit(item.text) || item.details.some(hit)) add(itemText(item), source.videoId);
      }
      for (const line of b.plain) {
        if (hit(line)) add(clip(line, ITEM_CHARS), source.videoId);
      }
    }
  }
  return [...byText.entries()].map(([text, ids]) => ({ text, videoIds: [...ids].sort((a, b) => a - b) }));
}

/** Total size of the excerpts, for the size cap. */
export function linesChars(lines: CheatSheetLine[]): number {
  return lines.reduce((n, l) => n + l.text.length, 0);
}

/**
 * A short fingerprint of the excerpts (order-independent), saved with a
 * sheet; when today's excerpts give a different one, the notes changed.
 */
export function linesHash(lines: CheatSheetLine[]): string {
  const all = lines
    .map((l) => `${l.videoIds.join(",")}|${l.text}`)
    .sort()
    .join("\n");
  let h = 2166136261; // FNV-1a, 32-bit: plenty for "did this change?"
  for (let i = 0; i < all.length; i++) {
    h ^= all.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Which videos a genre choice covers, the way the Notebook's filter reads it. */
export function genreMatches(genreKey: string, genreId: number | null): boolean {
  return genreKey === "all" || String(genreId ?? "none") === genreKey;
}
