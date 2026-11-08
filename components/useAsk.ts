import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { askJob, clearAskError, receiveAnswers, startAsk, subscribeAsks } from "./inFlight";
import type { Answer } from "./types";

/**
 * Puts the cursor in the Ask box, so typing *and* dictation land there.
 * Dictation apps insert text into whatever has focus; without this the
 * focus sat on the card's Ask button (or on a send/suggestion button that
 * goes disabled while Gemini thinks), and dictated words vanished.
 * Not on touch screens (it would pop the keyboard up), and never away from
 * another text field you're typing in (a note, a search).
 */
function focusAskBox(box: HTMLTextAreaElement | null) {
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
 * Pass `inputRef` to the box's AskField: it gets the cursor when it appears
 * and again after each answer.
 *
 * The request itself lives in components/inFlight.ts, not here (FIX-11):
 * close the panel while Gemini thinks and reopen the video, and the question
 * is still "Thinking…"; an answer (or failure) that arrived meanwhile shows
 * the next time the video is shown.
 */
export function useAsk(videoId: number, onAnswer: (answer: Answer) => void) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const job = useSyncExternalStore(subscribeAsks, () => askJob(videoId), () => null);
  const pending = job && job.error == null ? job.question : null;

  // A stable callback ref: runs when the box appears (panel opened, Ask tab
  // chosen), not on every render — so it never pulls focus back later.
  const box = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = useCallback((el: HTMLTextAreaElement | null) => {
    box.current = el;
    focusAskBox(el);
  }, []);

  // Answers arrive here, including one that came while nothing showed this video.
  const onAnswerRef = useRef(onAnswer);
  useEffect(() => {
    onAnswerRef.current = onAnswer;
  });
  useEffect(() => receiveAnswers(videoId, (note) => onAnswerRef.current(note)), [videoId]);

  // A failed question (maybe while the panel was closed): say why, and give
  // the text back, unless something new was typed.
  useEffect(() => {
    if (!job || job.error == null) return;
    // A failure is an outside event, not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(job.error);
    setQuestion((q) => q || job.question);
    clearAskError(videoId);
  }, [job, videoId]);

  // Answer (or error) in: back to the box, ready for the next question.
  useEffect(() => {
    if (!pending) focusAskBox(box.current);
  }, [pending]);

  function ask(prompt: string) {
    const text = prompt.trim();
    if (!text || pending) return;
    setError(null);
    setQuestion(""); // sent: it shows as the pending question now
    startAsk(videoId, text);
  }

  return { question, setQuestion, pending, error, ask, inputRef };
}
