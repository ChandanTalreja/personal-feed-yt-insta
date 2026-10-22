// Handwritten cheat sheets (FEAT-16), part 2: how the page looks, as data.
// A new paper, ink, hand or preset is one more entry in a list below; the
// Paper component reads these values as CSS variables, so nothing else
// changes. Paper and ink colours are the papers' own (real paper isn't
// cream-and-ink), so they live here, not in the site's @theme.

export type PaperPattern = "lines" | "grid" | "dots" | "cards";

export interface Paper {
  id: string;
  name: string;
  pattern: PaperPattern;
  /** The sheet (or each card). */
  background: string;
  /** Its printed lines, grid or dots. */
  rule: string;
  /** The red margin line (ruled paper) or the line under each card's question. */
  margin: string | null;
}

export const PAPERS: Paper[] = [
  { id: "ruled", name: "Ruled", pattern: "lines", background: "#fffef8", rule: "#c9d6ec", margin: "#e7a7b0" },
  { id: "grid", name: "Grid", pattern: "grid", background: "#f1f5e9", rule: "#c3d6b1", margin: null },
  { id: "dotted", name: "Dotted", pattern: "dots", background: "#fffdf7", rule: "#b9b2a4", margin: null },
  { id: "cards", name: "Index cards", pattern: "cards", background: "#fffffb", rule: "#cfdbf0", margin: "#e7a7b0" },
];

export interface Ink {
  id: string;
  name: string;
  color: string;
}

export const INKS: Ink[] = [
  { id: "pen", name: "Blue pen", color: "#2c55c7" }, // the site's own pen blue
  { id: "ink", name: "Black ink", color: "#1a1712" }, // the site's ink
  { id: "pencil", name: "Pencil", color: "#55524b" },
];

export interface Hand {
  id: string;
  name: string;
  /** The CSS variable components/handwritten/fonts.ts loads it into. */
  family: string;
  /** Each face at the same visual size (their letters differ a lot). */
  size: number;
  /** Questions and headings are bold where the face has a bold. */
  boldWeight: 400 | 700;
  /** Pixels down so the letters sit on the printed line. */
  nudge: number;
}

export const HANDS: Hand[] = [
  { id: "caveat", name: "Caveat", family: "var(--hand-caveat)", size: 27, boldWeight: 700, nudge: 3 },
  { id: "kalam", name: "Kalam", family: "var(--hand-kalam)", size: 20, boldWeight: 700, nudge: 4 },
  { id: "architect", name: "Architect", family: "var(--hand-architect)", size: 19, boldWeight: 400, nudge: 3 },
  { id: "nanum", name: "Nanum Pen", family: "var(--hand-nanum)", size: 28, boldWeight: 400, nudge: 3 },
];

export type MarkId = "highlight" | "underline" | "circle" | "none";

export const MARKS: { id: MarkId; name: string }[] = [
  { id: "highlight", name: "Highlighter" },
  { id: "underline", name: "Underline" },
  { id: "circle", name: "Circle" },
  { id: "none", name: "None" },
];

/** The site's yellow marker, see-through so the words show. */
export const HIGHLIGHTER = "rgba(255, 208, 43, 0.55)";

export interface HandwrittenStyle {
  paper: string;
  ink: string;
  hand: string;
  marks: MarkId;
}

export interface Preset extends HandwrittenStyle {
  id: string;
  name: string;
  /** What it is, in a few words. */
  tag: string;
}

export const PRESETS: Preset[] = [
  { id: "notebook", name: "School notebook", tag: "ruled, blue pen, highlighter", paper: "ruled", ink: "pen", hand: "caveat", marks: "highlight" },
  { id: "engineer", name: "Engineer's pad", tag: "grid, black ink, circled numbers", paper: "grid", ink: "ink", hand: "architect", marks: "circle" },
  { id: "cards", name: "Revision cards", tag: "one card per question", paper: "cards", ink: "pen", hand: "kalam", marks: "none" },
];

/** School notebook. */
export const DEFAULT_STYLE: HandwrittenStyle = { paper: "ruled", ink: "pen", hand: "caveat", marks: "highlight" };

/** A saved style, with anything unknown (an old or edited value) reset. */
export function cleanStyle(raw: unknown): HandwrittenStyle {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends { id: string }>(list: T[], value: unknown, fallback: string) =>
    list.some((x) => x.id === value) ? (value as string) : fallback;
  return {
    paper: pick(PAPERS, s.paper, DEFAULT_STYLE.paper),
    ink: pick(INKS, s.ink, DEFAULT_STYLE.ink),
    hand: pick(HANDS, s.hand, DEFAULT_STYLE.hand),
    marks: pick(MARKS, s.marks, DEFAULT_STYLE.marks) as MarkId,
  };
}

export function resolveStyle(style: HandwrittenStyle) {
  return {
    paper: PAPERS.find((p) => p.id === style.paper) ?? PAPERS[0],
    ink: INKS.find((i) => i.id === style.ink) ?? INKS[0],
    hand: HANDS.find((h) => h.id === style.hand) ?? HANDS[0],
    marks: style.marks,
  };
}

export function matchingPreset(style: HandwrittenStyle): Preset | undefined {
  return PRESETS.find(
    (p) => p.paper === style.paper && p.ink === style.ink && p.hand === style.hand && p.marks === style.marks
  );
}
