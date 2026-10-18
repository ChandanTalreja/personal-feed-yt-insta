import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { notifyNavChanged } from "@/lib/nav-events";
import type { Answer } from "./types";

/**
 * Puts the cursor in the Ask box, so typing *and* dictation land there.
 * Dictation apps insert text into whatever has focus; without this the
 * focus sat on the card's Ask button (or on a send/suggestion button that
 * goes disabled while Gemini thinks), and dictated words vanished.
 * Not on touch screens (it would pop the keyboard up), and never away from
 * another text field you're typing in (a note, a search).
 */
function focusAskBox(box: HTMLInputElement | null) {
  if (!box || box.disabled) return;
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const active = document.activeElement;
  const typingElsewhere =
    active !== box &&
    active instanceof HTMLElement &&
    (active.matches("input, textarea") || active.isContentEditable);
  if (!typingElsewhere) box.focus({ preventScroll: true });
}

/**
 * Asking Gemini about a video — the study panel's and the Notebook's Ask box.
 * The box empties as soon as you send (the question shows as "Thinking…");
 * if the request fails, your text comes back so you can fix or retry it.
 * `onAnswer` gets the saved answer; each screen shows it its own way.
 * Pass `inputRef` to the box's <input>: it gets the cursor when it appears
 * and again after each answer.
 */
export function useAsk(videoId: number, onAnswer: (answer: Answer) => void) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A stable callback ref: runs when the box appears (panel opened, Ask tab
  // chosen), not on every render — so it never pulls focus back later.
  const box = useRef<HTMLInputElement | null>(null);
  const inputRef = useCallback((el: HTMLInputElement | null) => {
    box.current = el;
    focusAskBox(el);
  }, []);

  // Answer (or error) in: back to the box, ready for the next question.
  useEffect(() => {
    if (!pending) focusAskBox(box.current);
  }, [pending]);

  async function ask(prompt: string) {
    const text = prompt.trim();
    if (!text || pending) return;
    setPending(text);
    setError(null);
    setQuestion(""); // sent: it shows as the pending question now
    try {
      const data = await api(`/api/videos/${videoId}/ask`, {
        method: "POST",
        body: { prompt: text },
        fallback: "Couldn't answer that",
      });
      onAnswer(data.note);
      notifyNavChanged();
    } catch (err) {
      setError((err as Error).message);
      setQuestion((q) => q || text); // give it back, unless something new was typed
    } finally {
      setPending(null);
    }
  }

  return { question, setQuestion, pending, error, ask, inputRef };
}
