"use client";

import { GENRE_PALETTE, sameColor, textColorFor } from "@/lib/color";

interface Props {
  value: string;
  onChange: (color: string) => void;
  /** Other genres' colors, so used swatches can be marked (not blocked). */
  taken: { name: string; color: string }[];
  /** Genre name shown in the live preview chip. */
  previewName: string;
}

/**
 * Curated palette + a custom color-wheel swatch + a live preview of the
 * genre chip. Shared by the new-genre form and the edit-genre form.
 */
export default function GenreColorPicker({
  value,
  onChange,
  taken,
  previewName,
}: Props) {
  const usedBy = (color: string) =>
    taken.filter((t) => sameColor(t.color, color)).map((t) => t.name);
  const isCustom = !GENRE_PALETTE.some((c) => sameColor(c, value));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        {GENRE_PALETTE.map((color) => {
          const owners = usedBy(color);
          const selected = sameColor(value, color);
          return (
            <button
              key={color}
              type="button"
              aria-label={`Pick color ${color}${
                owners.length ? ` (used by ${owners.join(", ")})` : ""
              }`}
              title={owners.length ? `Used by ${owners.join(", ")}` : color}
              className="relative h-7 w-7 cursor-pointer rounded-full border-2 border-[var(--ink)]"
              style={{
                backgroundColor: color,
                outline: selected ? "3px solid var(--ink)" : "none",
                outlineOffset: "2px",
              }}
              onClick={() => onChange(color)}
            >
              {owners.length > 0 && (
                // Small dot = another genre already uses this color.
                <span
                  className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: textColorFor(color) }}
                />
              )}
            </button>
          );
        })}

        {/* Custom: the browser's own color wheel, hidden under a "+" swatch.
            Once a custom color is picked, the swatch shows it. */}
        <label
          title="Custom color"
          className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-[var(--ink)] text-sm font-bold"
          style={{
            backgroundColor: isCustom ? value : "var(--paper)",
            color: isCustom ? textColorFor(value) : "var(--ink)",
            outline: isCustom ? "3px solid var(--ink)" : "none",
            outlineOffset: "2px",
          }}
        >
          +
          <input
            type="color"
            aria-label="Pick a custom color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={value.toLowerCase()}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
          />
        </label>
      </div>

      {/* Live preview — exactly how the chip will look, text color included. */}
      <span
        className="nb-sm rounded-full px-3 py-1 text-xs font-bold"
        style={{ backgroundColor: value, color: textColorFor(value) }}
      >
        {previewName.trim() || "Preview"}
      </span>
    </div>
  );
}
