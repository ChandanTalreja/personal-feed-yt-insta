import type { ReactNode } from "react";

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
      <mark key={at} className="rounded-xs bg-primary/45 text-ink">
        {text.slice(at, at + t.length)}
      </mark>
    );
    from = at + t.length;
  }
  out.push(text.slice(from));
  return out;
}
