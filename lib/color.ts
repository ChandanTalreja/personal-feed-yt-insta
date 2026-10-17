// Genre colors: the curated palette, hex validation, and readable text color.
// Pure functions with no server-only imports, so the API routes (validation)
// and the client components (picker, chips, tags) share one definition.

/** Curated genre palette in the neobrutalist style. Most are light enough
 *  for black text; the few darker ones get white text via textColorFor(). */
export const GENRE_PALETTE = [
  "#FFC900", // yellow
  "#FF4911", // orange-red
  "#4DA6FF", // blue
  "#2FCC71", // green
  "#FF90E8", // pink
  "#A78BFA", // purple
  "#00D1C1", // teal
  "#FF6B6B", // coral
  "#B8F35A", // lime
  "#FFA94D", // tangerine
  "#7DD3FC", // sky
  "#D4A373", // tan
  "#94A3B8", // slate
  "#3D5AFE", // indigo
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** True for a full 6-digit hex color like "#4DA6FF" — the only shape the
 *  palette and the browser's color picker produce, and the only shape the
 *  API stores. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** Same color regardless of letter case ("#ffc900" === "#FFC900"). */
export function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// WCAG relative luminance of an sRGB hex color (0 = black, 1 = white).
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

const INK_LUMINANCE = luminance("#161616"); // near --color-ink (#1a1712); kept as-is so chip text colours never flip

/**
 * Text color that stays readable on `background`: the site's ink (black) on
 * light colors, white on dark ones — whichever has the higher WCAG contrast
 * ratio. Non-hex values (e.g. a CSS variable fallback) keep the ink.
 */
export function textColorFor(background: string): string {
  if (!isHexColor(background)) return "var(--color-ink)";
  const bg = luminance(background);
  const contrastWithInk = (bg + 0.05) / (INK_LUMINANCE + 0.05);
  const contrastWithWhite = (1 + 0.05) / (bg + 0.05);
  return contrastWithWhite > contrastWithInk ? "#ffffff" : "var(--color-ink)";
}
