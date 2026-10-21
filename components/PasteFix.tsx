"use client";

import { useEffect } from "react";

/** Input types that hold plain text and support a cursor/selection. */
const TEXT_INPUTS = new Set(["text", "search", "url", "tel", "password"]);

/**
 * Pastes into any text box from the paste event's own copy of the
 * clipboard, instead of letting the browser read the clipboard a second
 * time. Dictation apps (Willow Voice) paste by putting the words on the
 * clipboard, pressing ⌘V, and then quickly putting the old clipboard back;
 * when that restore wins the race with the browser's second read, nothing
 * gets inserted (measured: a plain input landed 1 paste in 4, this 4 in 4).
 * Big sites like Google handle pastes the same way, which is why dictation
 * worked there. Ordinary ⌘V behaves as before: same text, and ⌘Z undoes it.
 * Anything that isn't plain text (an image, a file) is left to the browser.
 */
export default function PasteFix() {
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented) return; // a box with its own paste handling
      const el = e.target;
      const isInput = el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type);
      if (!isInput && !(el instanceof HTMLTextAreaElement)) return;
      if (el.readOnly || el.disabled) return;
      let text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      // What the browser itself does: one line in a single-line box.
      text = isInput ? text.replace(/\r?\n/g, " ") : text.replace(/\r\n/g, "\n");
      e.preventDefault();
      // insertText keeps undo working and fires the input events React
      // listens to; maxLength is respected.
      if (document.execCommand("insertText", false, text)) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      el.setRangeText(text, start, end, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return null;
}
