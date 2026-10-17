import { ICONS } from "./iconPaths";

export type IconName = keyof typeof ICONS;

/**
 * TUBEBOX's icons: Phosphor's duotone set (docs/REDESIGN.md §2 v2 → Icons).
 *
 * Each icon is an outline in the current text colour plus, for closed shapes,
 * a soft inner layer. At rest that layer is a faint tint of the outline. It
 * turns solid yellow when the icon is `lit` (something is "on": saved, has
 * answers, has a note), or when the button around it is hovered — any
 * ancestor with the `icon-hover` class (globals.css). Open shapes (check,
 * arrows, ✕, refresh) have no inner layer, so they never turn yellow.
 */
export default function Icon({
  name,
  size = 16,
  lit = false,
  filled = false,
  duotone = true,
  className = "",
}: {
  name: IconName;
  size?: number;
  /** Solid yellow inside: the thing this icon stands for is "on". */
  lit?: boolean;
  /** Solid in the text colour (the play triangle on a Watch button). */
  filled?: boolean;
  /** Draw the inner layer at all (off for icons that must stay plain). */
  duotone?: boolean;
  className?: string;
}) {
  const shape: { fill?: readonly string[]; line: readonly string[] } = ICONS[name];
  const layer = filled ? "icon-solid" : lit ? "icon-fill icon-lit" : "icon-fill";
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      fill="currentColor"
      className={`shrink-0 ${className}`}
    >
      {(duotone || filled) && shape.fill?.map((d) => <path key={`f${d}`} d={d} className={layer} />)}
      {shape.line.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
