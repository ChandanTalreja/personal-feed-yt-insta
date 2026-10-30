"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import Icon from "@/components/ui/Icon";
import { applyShortcut, parseBody, type Line } from "./lines";

/**
 * A sticky note's text, one line at a time, so a bullet shows as a dot and a
 * tick box as a box you can click while you write:
 * - "- " or "[] " at the start of a line turns it into a bullet or tick box;
 * - Enter starts the next line of the same kind (Enter on an empty one ends
 *   the list); Backspace at the start removes the dot or box, then joins lines;
 * - ↑ and ↓ at a line's ends move between lines.
 */
export default function NoteLines({
  lines,
  onChange,
  autoFocus = false,
  label,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  autoFocus?: boolean;
  /** Read by screen readers. */
  label: string;
}) {
  const boxes = useRef<(HTMLTextAreaElement | null)[]>([]);
  // Where the caret goes after the next render (set by the key handlers).
  const caretAfter = useRef<{ index: number; at: number } | null>(autoFocus ? { index: 0, at: 0 } : null);

  useLayoutEffect(() => {
    // Each line grows with its text (a textarea doesn't on its own).
    for (const box of boxes.current) {
      if (!box) continue;
      box.style.height = "auto";
      box.style.height = `${box.scrollHeight}px`;
    }
    const want = caretAfter.current;
    if (want) {
      caretAfter.current = null;
      const box = boxes.current[want.index];
      box?.focus();
      box?.setSelectionRange(want.at, want.at);
    }
  });

  const replace = (from: number, count: number, ...put: Line[]) =>
    onChange([...lines.slice(0, from), ...put, ...lines.slice(from + count)]);

  function typed(i: number, value: string, caret: number) {
    if (value.includes("\n")) {
      // Pasted several lines: each becomes its own line ("- a" a bullet…).
      const [first, ...rest] = value.split("\n");
      const added = parseBody(rest.join("\n"));
      caretAfter.current = { index: i + added.length, at: added[added.length - 1].text.length };
      replace(i, 1, applyShortcut({ ...lines[i], text: first }), ...added);
      return;
    }
    const next = applyShortcut({ ...lines[i], text: value });
    // The "- " or "[] " just typed became the dot or box: keep the caret on the text.
    if (next.kind !== lines[i].kind) caretAfter.current = { index: i, at: Math.max(0, caret - (value.length - next.text.length)) };
    replace(i, 1, next);
  }

  function keys(i: number, e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    const line = lines[i];
    const { selectionStart: start, selectionEnd: end } = e.currentTarget;
    const atStart = start === 0 && end === 0;
    const atEnd = start === line.text.length && end === line.text.length;

    // Shift+Enter too: a line never holds a line break.
    if (e.key === "Enter") {
      e.preventDefault();
      if (line.kind !== "text" && line.text === "") {
        // An empty bullet or box: Enter ends the list.
        caretAfter.current = { index: i, at: 0 };
        replace(i, 1, { ...line, kind: "text", done: false });
        return;
      }
      caretAfter.current = { index: i + 1, at: 0 };
      replace(
        i,
        1,
        { ...line, text: line.text.slice(0, start) },
        { kind: line.kind, done: false, text: line.text.slice(end) }
      );
    } else if (e.key === "Backspace" && atStart) {
      if (line.kind !== "text") {
        e.preventDefault();
        caretAfter.current = { index: i, at: 0 };
        replace(i, 1, { ...line, kind: "text", done: false });
      } else if (i > 0) {
        e.preventDefault();
        const prev = lines[i - 1];
        caretAfter.current = { index: i - 1, at: prev.text.length };
        replace(i - 1, 2, { ...prev, text: prev.text + line.text });
      }
    } else if (e.key === "Delete" && atEnd && i < lines.length - 1) {
      e.preventDefault();
      caretAfter.current = { index: i, at: line.text.length };
      replace(i, 2, { ...line, text: line.text + lines[i + 1].text });
    } else if (e.key === "ArrowUp" && atStart && i > 0) {
      e.preventDefault();
      caretAfter.current = { index: i - 1, at: lines[i - 1].text.length };
      onChange([...lines]);
    } else if (e.key === "ArrowDown" && atEnd && i < lines.length - 1) {
      e.preventDefault();
      caretAfter.current = { index: i + 1, at: 0 };
      onChange([...lines]);
    }
  }

  // A plain first line above more lines reads as the note's title.
  const titled = lines.length > 1 && lines[0].kind === "text" && lines[0].text.trim() !== "";

  return (
    <div role="group" aria-label={label} className="flex flex-col">
      {lines.map((line, i) => (
        <div key={i} className="flex items-start gap-2">
          {line.kind === "bullet" && (
            <span className="mt-[calc(0.75em-3px)] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
          )}
          {line.kind === "todo" && (
            <button
              type="button"
              role="checkbox"
              aria-checked={line.done}
              aria-label={line.text || "Tick box"}
              onClick={() => replace(i, 1, { ...line, done: !line.done })}
              className="mt-[calc(0.75em-8px)] flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] border-ink bg-surface/60"
            >
              {line.done && <Icon name="check" size={11} />}
            </button>
          )}
          <textarea
            ref={(el) => {
              boxes.current[i] = el;
            }}
            rows={1}
            value={line.text}
            placeholder={lines.length === 1 && i === 0 ? "Write something" : undefined}
            aria-label={`Line ${i + 1}`}
            onChange={(e) => typed(i, e.target.value, e.target.selectionStart)}
            onKeyDown={(e) => keys(i, e)}
            className={`w-full min-w-0 resize-none overflow-hidden bg-transparent leading-normal outline-none placeholder:text-ink/40 ${
              i === 0 && titled ? "font-bold" : ""
            } ${line.done ? "text-ink/55 line-through" : ""}`}
          />
        </div>
      ))}
    </div>
  );
}
