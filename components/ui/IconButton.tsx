import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Shown instantly on hover/focus, and read out by screen readers. */
  label: string;
  /** The icon itself (an <Icon>). */
  children: ReactNode;
  /** Filled black — e.g. the tool whose panel is open. */
  active?: boolean;
  /** A small number (e.g. saved answers) or a dot (something is waiting). */
  badge?: number | "dot";
  /** Where the hover label anchors, so edge buttons don't clip it. */
  align?: "left" | "center" | "right";
  /** Open the label below — for buttons at the top of the page, where above is off-screen. */
  tipBelow?: boolean;
  /** No frame until hovered (rows of tools inside a card or list). */
  ghost?: boolean;
}

/**
 * Icon button with an instant hover label (the browser's own `title` tooltip
 * only appears after ~1 second). The label listens to this button only (a
 * named group), so a hover-group around it — a track row — can't open every
 * button's label at once. Quiet at rest; on hover the frame darkens
 * and the icon lights up (`icon-hover`).
 */
export default function IconButton({
  label,
  children,
  active = false,
  badge,
  align = "center",
  tipBelow = false,
  ghost = false,
  className = "",
  type = "button",
  ...rest
}: Props) {
  const anchor =
    align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  const look = active
    ? "border-ink bg-ink text-cream"
    : ghost
      ? "border-transparent text-muted hover:bg-ink/5 hover:text-ink"
      : "border-line bg-surface text-muted hover:border-ink hover:text-ink";
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={`icon-hover group/ib relative inline-flex h-8 min-w-8 select-none items-center justify-center rounded-md border px-1.5 transition-colors disabled:pointer-events-none disabled:opacity-45 ${look} ${className}`}
      {...rest}
    >
      {children}
      {badge === "dot" && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-[1.5px] ring-ink" />
      )}
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-xs bg-primary px-1 font-mono text-xs font-bold leading-4 text-ink">
          {badge}
        </span>
      )}
      <span
        className={`pointer-events-none absolute z-30 hidden ${tipBelow ? "top-full mt-1.5" : "bottom-full mb-1.5"} whitespace-nowrap rounded-xs bg-ink px-2 py-1 text-xs font-semibold text-cream group-hover/ib:block group-focus-visible/ib:block ${anchor}`}
      >
        {label}
      </span>
    </button>
  );
}
