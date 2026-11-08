"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/** How tall the box may grow before it scrolls inside. */
const MAX_LINES = 5;

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Read by screen readers (the box has no visible label). */
  label: string;
  /** From useAsk: puts the cursor here (so dictation lands in the box). */
  inputRef: (el: HTMLTextAreaElement | null) => void;
  className?: string;
}

/**
 * The Ask box's text: one line when empty, growing a line at a time as the
 * question wraps, up to five lines, then scrolling inside with the end in
 * view. A one-line input only scrolls to the cursor on a key press, so a
 * dictated question (dropped in all at once) showed its start, not its end.
 * Enter sends (the form's submit), Shift+Enter starts a new line.
 */
export default function AskField({ value, onChange, placeholder, label, inputRef, className = "" }: Props) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const ref = useCallback(
    (el: HTMLTextAreaElement | null) => {
      box.current = el;
      inputRef(el);
    },
    [inputRef]
  );

  // Fit the height to the text, however it arrived: typed, dictated,
  // pasted, or a failed question given back.
  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const css = getComputedStyle(el);
    const max = parseFloat(css.lineHeight) * MAX_LINES + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
    // Cursor at the end (dictation, or typing on): keep the end in view.
    if (el.selectionEnd === el.value.length) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(fit, [value, fit]);

  // A wider or narrower box wraps differently: fit again when its width changes.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let width = el.clientWidth;
    const watch = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={`block min-w-0 flex-1 resize-none bg-transparent py-3 text-sm outline-none placeholder:text-muted ${className}`}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
      aria-label={label}
    />
  );
}
