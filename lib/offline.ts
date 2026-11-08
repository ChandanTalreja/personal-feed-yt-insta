import { forgetRemembered } from "./api-client";

// Changes made while offline (✓ seen, Watch later, a video's note closed
// unsaved) wait in a list instead of being undone or lost, and save on their
// own when the connection is back. The list lives in localStorage, so it
// also survives a reload. Browser-side only.
//
// Offline is not the same as "the server said no": a refused save (logged
// out, a bad request) won't succeed by waiting, so callers undo those. A
// server in trouble (5xx, e.g. Netlify waking up) is neither: it waits too.

export const OFFLINE_MESSAGE = "You're offline. Your changes will save when you're back online.";

/** Fired whenever the waiting list changes (the offline bar listens). */
export const PENDING_CHANGED = "tubebox:pending-changed";
/** Fired after changes left over from an earlier visit were saved (the feed reloads). */
export const PENDING_RESTORED = "tubebox:pending-restored";

const KEY = "tubebox:pending-saves";

type PendingSave =
  | { videoId: number; field: "watched" | "later"; value: boolean }
  | { videoId: number; field: "personalNote"; value: string };

function read(): PendingSave[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: PendingSave[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode): the list still lives for this page.
  }
  window.dispatchEvent(new Event(PENDING_CHANGED));
}

/** The browser says there's no connection. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function pendingCount(): number {
  return typeof window === "undefined" ? 0 : read().length;
}

/**
 * Queue a change to save later. Only the latest value per video and field is
 * kept: ✓ then untick then ✓ again sends one save, not three.
 */
export function queueVideoSave(videoId: number, field: "watched" | "later", value: boolean) {
  queue({ videoId, field, value });
}

/**
 * A video's note that couldn't be saved as its editor closed (offline, or
 * the server in trouble): only the latest text waits.
 */
export function queueNoteSave(videoId: number, text: string) {
  queue({ videoId, field: "personalNote", value: text });
}

/** The note text waiting for this video, if any (shown when it's reopened). */
export function pendingNote(videoId: number): string | null {
  if (typeof window === "undefined") return null;
  const item = read().find((p) => p.videoId === videoId && p.field === "personalNote");
  return item ? (item.value as string) : null;
}

/** The note saved directly after all: the waiting copy is older, drop it. */
export function dropPendingNote(videoId: number) {
  const list = read();
  const kept = list.filter((p) => !(p.videoId === videoId && p.field === "personalNote"));
  if (kept.length !== list.length) write(kept);
}

function queue(save: PendingSave) {
  const list = read().filter((p) => !(p.videoId === save.videoId && p.field === save.field));
  list.push(save);
  write(list);
}

/**
 * Send the waiting list, oldest first. Stops at the first network failure
 * or server error (still offline, or the server in trouble; the rest keep
 * waiting and are tried again). A save the server refuses (4xx) is dropped
 * and counted in `refused`, since waiting won't change the answer.
 */
export async function flushPending(): Promise<{ saved: number; refused: number; left: number }> {
  let saved = 0;
  let refused = 0;
  let notes = 0;
  for (const item of read()) {
    let res: Response;
    try {
      res = await fetch(`/api/videos/${item.videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [item.field]: item.value }),
      });
    } catch {
      break; // no connection yet
    }
    if (res.status >= 500) break; // the server in trouble: try again later
    // Drop this one (saved or refused), keeping anything queued meanwhile.
    write(read().filter((p) => !(p.videoId === item.videoId && p.field === item.field && p.value === item.value)));
    if (res.ok) saved++;
    else refused++;
    if (res.ok && item.field === "personalNote") notes++;
  }
  // A note changes the Notebook and the cards: forget their remembered copies.
  if (notes > 0) forgetRemembered();
  return { saved, refused, left: read().length };
}
