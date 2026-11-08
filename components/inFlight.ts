// Gemini requests that outlive the screen that started them (FIX-11). Asking,
// summarising or fetching a transcript takes seconds; if you close the study
// panel (or move to another video) meanwhile, the panel is gone but the
// request isn't: the server still answers and saves it. Kept here, for as
// long as the browser tab, instead of inside the panel, so reopening the
// video shows the question still thinking, and the answer lands on whatever
// shows that video next. The same idea as lib/syncStatus.ts (FIX-09).
// Browser-side only; a reload starts empty (the saved answer still shows,
// from the server).

import { api } from "@/lib/api-client";
import { notifyNavChanged } from "@/lib/nav-events";
import type { Answer } from "./types";

// ---------- One request at a time per job (Summary, Transcript) ----------

const running = new Map<string, Promise<unknown>>();

/**
 * Runs `run` once per `key` at a time: asking again while it's running
 * (the panel reopened) joins the same request instead of starting another.
 */
export function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const current = running.get(key);
  if (current) return current as Promise<T>;
  const request = run().finally(() => running.delete(key));
  running.set(key, request);
  return request;
}

// ---------- Ask ----------

/** A question being answered (error null), or one that failed, not yet shown. */
export interface AskJob {
  question: string;
  error: string | null;
}

const asks = new Map<number, AskJob>();
const listeners = new Set<() => void>();
// Who shows each video's answers right now (the panel, the Notebook).
const receivers = new Map<number, Set<(note: Answer) => void>>();
// Answers that arrived with nothing showing their video: handed over when
// something shows it again.
const unclaimed = new Map<number, Answer>();

function changed() {
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore. */
export function subscribeAsks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function askJob(videoId: number): AskJob | null {
  return asks.get(videoId) ?? null;
}

/** Sends a question about a video, unless one is already being answered. */
export function startAsk(videoId: number, question: string): void {
  if (asks.get(videoId)?.error === null) return;
  asks.set(videoId, { question, error: null });
  changed();
  api(`/api/videos/${videoId}/ask`, {
    method: "POST",
    body: { prompt: question },
    fallback: "Couldn't answer that",
  })
    .then((data) => {
      asks.delete(videoId);
      changed();
      const note = data.note as Answer;
      const here = receivers.get(videoId);
      if (here?.size) here.forEach((receive) => receive(note));
      else unclaimed.set(videoId, note);
      notifyNavChanged();
    })
    .catch((err) => {
      asks.set(videoId, { question, error: (err as Error).message });
      changed();
    });
}

/** A failure has been shown (its question given back to the box): forget it. */
export function clearAskError(videoId: number): void {
  if (asks.get(videoId)?.error == null) return;
  asks.delete(videoId);
  changed();
}

/**
 * Receive this video's answers as they arrive, starting with any that
 * arrived while nothing showed it. Returns the unsubscribe.
 */
export function receiveAnswers(videoId: number, receive: (note: Answer) => void): () => void {
  const set = receivers.get(videoId) ?? new Set();
  set.add(receive);
  receivers.set(videoId, set);
  const waiting = unclaimed.get(videoId);
  if (waiting) {
    unclaimed.delete(videoId);
    receive(waiting);
  }
  return () => {
    set.delete(receive);
    if (set.size === 0) receivers.delete(videoId);
  };
}
