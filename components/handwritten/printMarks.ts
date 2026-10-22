import type { CSSProperties } from "react";
import { HIGHLIGHTER } from "@/lib/handwritten/themes";

// The marks for Save as PDF. On screen Rough Notation draws them (animated,
// useRoughMarks.ts), but it places each stroke once, at fixed positions; a
// printed page is a different width and breaks into A4 pages, so the words
// move and the strokes wouldn't. For print, each mark is a hand-drawn stroke
// in the words' own background instead, which moves with them. Built from
// the ink here, so the colours have one source (lib/handwritten/themes.ts).

const svg = (viewBox: string, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}' preserveAspectRatio='none'>${body}</svg>`
  )}")`;

/** CSS variables handwritten.css uses for the printed marks. */
export function printMarkVars(ink: string): CSSProperties {
  const stroke = `fill='none' stroke='${ink}' stroke-linecap='round' vector-effect='non-scaling-stroke'`;
  return {
    // A felt-tip swipe: slightly uneven edges, like the marker under the tabs.
    "--hw-print-highlight": svg(
      "0 0 100 20",
      `<path d='M1 6 C 20 3, 62 2, 99 5 L 98 16 C 62 18, 24 18, 2 15 Z' fill='${HIGHLIGHTER}'/>`
    ),
    // A pen line that wanders a little.
    "--hw-print-underline": svg("0 0 100 6", `<path d='M1 4 C 25 2, 50 5, 75 3 S 95 3, 99 4' stroke-width='1.6' ${stroke}/>`),
    // A loop drawn round the number, not quite closed.
    "--hw-print-circle": svg(
      "0 0 40 30",
      `<path d='M22 2 C 35 2, 39 10, 38 16 C 37 25, 27 29, 18 28 C 7 27, 1 20, 3 12 C 5 5, 13 1, 26 3' stroke-width='1.4' ${stroke}/>`
    ),
  } as CSSProperties;
}
