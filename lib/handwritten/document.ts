// Handwritten cheat sheets (FEAT-16), part 1: what gets written. Pure data,
// no React and no database, so the page, the Studio and any future export
// (a PDF library, say) all write exactly the same thing.

/** One question as it's written on the paper. */
export interface WrittenQuestion {
  /** 1, 2, 3… numbering starts again on every sheet. */
  number: number;
  question: string;
  /** Gemini's answer when it found one; otherwise nothing is written under it. */
  answer: string | null;
  /** How many videos asked it: "(asked in 3 videos)". */
  askedIn: number;
}

/** One cheat sheet as one handwritten page (in the PDF, it starts a new page). */
export interface WrittenSheet {
  id: number;
  /** The chip in the picker: "SQL", "Auto configuration". */
  topic: string;
  /** What's written at the top: your heading, or "<Topic> questions". */
  heading: string;
  defaultHeading: string;
  questions: WrittenQuestion[];
}

/** The fields of a stored cheat sheet this needs (server row or API reply). */
export interface SheetSource {
  id: number;
  query: string;
  handwrittenTitle: string | null;
  questions: { question: string; answer: string | null; videoIds: number[] }[];
}

/** "hash map" → "Hash map"; short topics are usually acronyms: "sql" → "SQL". */
export function topicName(query: string): string {
  const q = query.trim();
  return q.length <= 3 ? q.toUpperCase() : q.charAt(0).toUpperCase() + q.slice(1);
}

export function defaultHeading(query: string): string {
  return `${topicName(query)} questions`;
}

export function toWrittenSheet(sheet: SheetSource): WrittenSheet {
  const fallback = defaultHeading(sheet.query);
  return {
    id: sheet.id,
    topic: topicName(sheet.query),
    heading: sheet.handwrittenTitle?.trim() || fallback,
    defaultHeading: fallback,
    questions: sheet.questions.map((q, i) => ({
      number: i + 1,
      question: q.question,
      answer: q.answer?.trim() || null,
      askedIn: q.videoIds.length,
    })),
  };
}

export function askedLabel(n: number): string {
  return `(asked in ${n} video${n === 1 ? "" : "s"})`;
}

/**
 * The sheets picked in the address: "?sheets=7,3,1", or "all". Unknown ids
 * are dropped; the order is always the Notebook's, whatever the address says.
 * Nothing valid → the first sheet, so the page is never empty.
 */
export function pickSheets(raw: string | undefined, available: number[]): number[] {
  if (available.length === 0) return [];
  if (raw === "all") return available;
  const asked = new Set((raw ?? "").split(",").map(Number));
  const picked = available.filter((id) => asked.has(id));
  return picked.length ? picked : [available[0]];
}

/** The address form of a pick: every sheet is "all". */
export function sheetsParam(picked: number[], available: number[]): string {
  return picked.length === available.length && available.length > 1 ? "all" : picked.join(",");
}

/**
 * Pieces of a line, with the code-ish words marked: @Annotations,
 * dotted.names and CamelCase stay upright so they read clearly.
 */
export function splitCode(text: string): { text: string; code: boolean }[] {
  const out: { text: string; code: boolean }[] = [];
  const pattern = /@[A-Za-z]\w*|\b\w+(?:\.\w+)+\b|\b[A-Z][a-z]+[A-Z]\w*\b/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), code: false });
    out.push({ text: m[0], code: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), code: false });
  return out;
}
