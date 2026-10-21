import type { ReactNode } from "react";
import { loosePattern } from "@/lib/looseMatch";

export { looseMatcher } from "@/lib/looseMatch";

/** The soft yellow highlighter behind a search match (global search, Notebook). */
export const MARK_CLASS = "rounded-xs bg-primary/45 text-ink";

/** Wrap each case-insensitive match of `term` in a soft yellow mark. */
export function highlight(text: string, term: string): ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(t); at !== -1; at = lower.indexOf(t, from)) {
    out.push(text.slice(from, at));
    out.push(
      <mark key={at} className={MARK_CLASS}>
        {text.slice(at, at + t.length)}
      </mark>
    );
    from = at + t.length;
  }
  out.push(text.slice(from));
  return out;
}

/** Splits text into plain parts and loose matches of `term`. */
function splitLoose(text: string, term: string): { text: string; match: boolean }[] {
  const pattern = loosePattern(term);
  if (!pattern) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: m[0], match: true });
    from = at + m[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

/** `highlight()` with loose matching (Notebook). */
export function highlightLoose(text: string, term: string): ReactNode {
  return splitLoose(text, term).map((p, i) =>
    p.match ? (
      <mark key={i} className={MARK_CLASS}>{p.text}</mark>
    ) : (
      p.text
    )
  );
}

// The few HTML-tree (hast) shapes the plugin below touches, declared here
// rather than importing @types/hast, which the app doesn't depend on itself.
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * react-markdown plugin: loose-match marks inside rendered markdown (lists,
 * bold, headings…). It runs on the tree after the markdown is parsed, so it
 * never touches syntax. A match split by formatting ("hash **map**") isn't
 * marked; the answer is still found by the search.
 */
export function rehypeHighlight(term: string) {
  const split = (value: string): HastNode[] =>
    splitLoose(value, term).map((p) =>
      p.match
        ? { type: "element", tagName: "mark", properties: {}, children: [{ type: "text", value: p.text }] }
        : { type: "text", value: p.text }
    );
  const walk = (node: HastNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === "text" && child.value) return split(child.value);
      walk(child);
      return [child];
    });
  };
  return (tree: HastNode) => {
    if (loosePattern(term)) walk(tree);
  };
}
