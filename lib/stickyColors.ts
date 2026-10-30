/**
 * The six sticky-note papers (FEAT-17): the sidebar's four tiles, plus peach
 * and lilac. The colours themselves are `--color-tile-*` in app/globals.css.
 * Its own file so the browser can use the list without the server code.
 */
export const STICKY_COLORS = ["yellow", "pink", "green", "blue", "peach", "lilac"] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

export function isStickyColor(value: unknown): value is StickyColor {
  return typeof value === "string" && (STICKY_COLORS as readonly string[]).includes(value);
}
