// The top bar's "Sync now", kept outside any one page. Every page draws its
// own top bar, so a sync started on Podcasts used to lose its "Syncing"
// badge, its result and the page refresh when you moved to the Feed (the
// sync itself always finished on the server). This module lives as long as
// the browser tab, so whichever top bar is on screen sees the sync running
// and gets its result.

export interface SyncResult {
  id: number;
  message: string;
  /** Set by the top bar that showed it, so another page doesn't repeat it. */
  shown: boolean;
}

interface SyncState {
  running: boolean;
  result: SyncResult | null;
}

let state: SyncState = { running: false, result: null };
const listeners = new Set<() => void>();
const SERVER_STATE: SyncState = { running: false, result: null };
let lastId = 0;

function update(next: SyncState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore. */
export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getSyncState = (): SyncState => state;
export const getServerSyncState = (): SyncState => SERVER_STATE;

/**
 * Runs one sync (`run` does the request and returns the message to show).
 * A second press while one is running does nothing: no double syncs.
 */
export async function startSync(run: () => Promise<string>): Promise<void> {
  if (state.running) return;
  update({ ...state, running: true });
  let message: string;
  try {
    message = await run();
  } catch (err) {
    message = (err as Error).message;
  }
  update({ running: false, result: { id: ++lastId, message, shown: false } });
}

/**
 * The finished sync's message, the first time a top bar asks for it; null
 * after that, so moving to another page doesn't show it again.
 */
export function takeSyncResult(id: number): string | null {
  const result = state.result;
  if (!result || result.id !== id || result.shown) return null;
  result.shown = true;
  return result.message;
}
