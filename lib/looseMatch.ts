// Shared by the Notebook's search and highlights (components/ui/highlight.tsx)
// and by cheat sheets (lib/cheatSheetLines.ts), in the browser and on the
// server, so "what matches" means the same thing everywhere.

/**
 * Loose search (Notebook): spaces, hyphens and underscores between letters
 * don't matter, so "hash map" also finds "HashMap", "hashmap" and
 * "hash-map" (and "hashmap" finds "hash map"). Case never matters.
 */
export function loosePattern(term: string, flags = "gi"): RegExp | null {
  const chars = [...looseKey(term)];
  if (chars.length === 0) return null;
  const escaped = chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("[\\s\\-_]*"), flags);
}

/** A test for loose matches of `term`; null when the term is empty. */
export function looseMatcher(term: string): ((text: string) => boolean) | null {
  const pattern = loosePattern(term, "i"); // no "g": test() stays stateless
  return pattern ? (text) => pattern.test(text) : null;
}

/** The loose form of a search, for comparing searches ("Hash Map" → "hashmap"). */
export function looseKey(term: string): string {
  return term.toLowerCase().replace(/[\s\-_]+/g, "");
}
