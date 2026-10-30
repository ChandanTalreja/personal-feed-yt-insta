// Sticky notes (FEAT-17): a note's text, line by line. Stored as plain text
// (sticky_notes.body) so it stays readable anywhere: "- " lines are bullets,
// "[ ] " and "[x] " lines are tick boxes, anything else is a plain line.

export type LineKind = "text" | "bullet" | "todo";

export interface Line {
  kind: LineKind;
  /** Ticked (tick boxes only). */
  done: boolean;
  text: string;
}

export const emptyLine = (kind: LineKind = "text"): Line => ({ kind, done: false, text: "" });

export function parseBody(body: string): Line[] {
  return body.split("\n").map((raw) => {
    const todo = raw.match(/^\[( |x|X)\] ?(.*)$/);
    if (todo) return { kind: "todo", done: todo[1] !== " ", text: todo[2] };
    const bullet = raw.match(/^- (.*)$/);
    if (bullet) return { kind: "bullet", done: false, text: bullet[1] };
    return { kind: "text", done: false, text: raw };
  });
}

export function toBody(lines: Line[]): string {
  return lines
    .map((l) => (l.kind === "todo" ? `[${l.done ? "x" : " "}] ${l.text}` : l.kind === "bullet" ? `- ${l.text}` : l.text))
    .join("\n");
}

/**
 * Typing at the start of a plain line: "- " (or "* ") makes it a bullet,
 * "[] " (or "[ ] ", "[x] ") a tick box. Only the start counts, so "a - b"
 * stays as written.
 */
export function applyShortcut(line: Line): Line {
  if (line.kind !== "text") return line;
  const bullet = line.text.match(/^[-*] ([\s\S]*)$/);
  if (bullet) return { kind: "bullet", done: false, text: bullet[1] };
  const todo = line.text.match(/^\[(x|X| )?\] ([\s\S]*)$/);
  if (todo) return { kind: "todo", done: (todo[1] ?? " ").toLowerCase() === "x", text: todo[2] };
  return line;
}

/** Nothing written: a new note left empty is removed when you click away. */
export function isBlank(lines: Line[]): boolean {
  return lines.every((l) => l.text.trim() === "");
}
