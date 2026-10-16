/** Browser event the top bar listens for to recount its nav badges. */
export const NAV_CHANGED = "tubebox:nav-changed";

/**
 * Tell the top bar its counts may be stale (a video marked watched, a note
 * saved, a track created). Components ring this bell instead of reaching
 * into the bar, so neither needs to know about the other.
 */
export function notifyNavChanged() {
  window.dispatchEvent(new Event(NAV_CHANGED));
}
