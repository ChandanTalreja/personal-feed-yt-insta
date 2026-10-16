/**
 * TUBEBOX's icons: "sticker duotone". An ink outline (the current text
 * colour, so it follows the button it sits in) over a yellow fill — but only
 * where the shape is closed (a bubble, a page, a star). Open shapes like ✕,
 * arrows and lines stay plain ink. Drawn on a 24×24 grid.
 */
const PATHS = {
  check: ["M20 6 9 17l-5-5"],
  bookmark: ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"],
  ask: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z", "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3", "M12 17h.01"],
  summary: [
    "M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.5l-1.9-5.9L4 10.7l6.1-1.9z",
    "M19 3v4",
    "M21 5h-4",
  ],
  text: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M16 13H8",
    "M16 17H8",
  ],
  note: [
    "M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z",
  ],
  track: ["M11 12H3", "M16 6H3", "M16 18H3", "M18 9v6", "M21 12h-6"],
  search: ["M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16", "m21 21-4.3-4.3"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  refresh: ["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"],
  play: ["M6 3l14 9-14 9z"],
  plus: ["M12 5v14", "M5 12h14"],
  copy: ["M8 8h12v12H8z", "M4 16V4h12"],
  send: ["M22 2 11 13", "M22 2l-7 20-4-9-9-4z"],
  chev: ["m6 9 6 6 6-6"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  chevUp: ["m18 15-6-6-6 6"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  pause: ["M7 4h3v16H7z", "M14 4h3v16h-3z"],
  trash: [
    "M5 6h14l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z",
    "M3 6h18",
    "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
    "M10 11v6",
    "M14 11v6",
  ],
} as const;

export type IconName = keyof typeof PATHS;

/** The yellow layer, drawn under the outline. Closed shapes only. */
const FILLS: Partial<Record<IconName, readonly string[]>> = {
  bookmark: [PATHS.bookmark[0]],
  ask: [PATHS.ask[0]],
  summary: [PATHS.summary[0]],
  text: [PATHS.text[0]],
  note: [PATHS.note[0]],
  search: [PATHS.search[0]],
  copy: [PATHS.copy[0]],
  send: [PATHS.send[1]],
  pause: [PATHS.pause[0], PATHS.pause[1]],
  trash: [PATHS.trash[0]],
};

export default function Icon({
  name,
  size = 16,
  filled = false,
  duotone = true,
  strokeWidth = 2.5,
  className = "",
}: {
  name: IconName;
  size?: number;
  /** Fill the shape too (a saved bookmark, the play triangle). */
  filled?: boolean;
  /** The yellow inner fill (on by default; skipped when `filled`). */
  duotone?: boolean;
  /** Line weight on the 24px grid. 2.5 reads as "drawn with a marker", not a pen. */
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {duotone &&
        !filled &&
        FILLS[name]?.map((d) => (
          <path key={`fill-${d}`} d={d} className="fill-primary" stroke="none" />
        ))}
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
