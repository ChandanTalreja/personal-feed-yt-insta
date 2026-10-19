// Changes made while offline (✓ seen, Watch later) wait in a list instead of
// being undone, and save on their own when the connection is back. The list
// lives in localStorage, so it also survives a reload. Browser-side only.
//
// Offline is not the same as "the server said no": a refused save (logged
// out, server error) won't succeed by waiting, so callers undo those.

export const OFFLINE_MESSAGE = "You're offline. Your changes will save when you're back online.";

/** Fired whenever the waiting list changes (the offline bar listens). */
export const PENDING_CHANGED = "tubebox:pending-changed";
/** Fired after changes left over from an earlier visit were saved (the feed reloads). */
export const PENDING_RESTORED = "tubebox:pending-restored";

const KEY = "tubebox:pending-saves";

interface PendingSave {
  videoId: number;
  field: "watched" | "later";
  value: boolean;
}

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
export function queueVideoSave(videoId: number, field: PendingSave["field"], value: boolean) {
  const list = read().filter((p) => !(p.videoId === videoId && p.field === field));
  list.push({ videoId, field, value });
  write(list);
}

/**
 * Send the waiting list, oldest first. Stops at the first network failure
 * (still offline; the rest keep waiting). A save the server refuses is
 * dropped and counted in `refused`, since waiting won't change the answer.
 */
export async function flushPending(): Promise<{ saved: number; refused: number; left: number }> {
  let saved = 0;
  let refused = 0;
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
    // Drop this one (saved or refused), keeping anything queued meanwhile.
    write(read().filter((p) => !(p.videoId === item.videoId && p.field === item.field && p.value === item.value)));
    if (res.ok) saved++;
    else refused++;
  }
  return { saved, refused, left: read().length };
}
