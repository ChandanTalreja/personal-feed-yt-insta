import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Shown instantly on hover/focus, and read out by screen readers. */
  label: string;
  /** The icon itself (emoji, SVG, or text). */
  children: ReactNode;
  /** Filled black — e.g. the tool whose panel is open. */
  active?: boolean;
  /** A small number (e.g. saved answers) or a dot (e.g. a note exists). */
  badge?: number | "dot";
  /** Where the hover label anchors, so edge buttons don't clip it. */
  align?: "left" | "center" | "right";
  /** Open the label below — for buttons at the top of the page, where above is off-screen. */
  tipBelow?: boolean;
}

/**
 * Square icon button with an instant hover label. Replaces the browser's
 * own `title` tooltip, which only appears after ~1 second.
 */
export default function IconButton({
  label,
  children,
  active = false,
  badge,
  align = "center",
  tipBelow = false,
  className = "",
  type = "button",
  ...rest
}: Props) {
  const anchor =
    align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={`group relative inline-flex h-8 min-w-8 select-none items-center justify-center border-2 border-ink px-1.5 text-sm transition-colors ${
        active ? "bg-ink text-cream" : "bg-surface text-ink hover:bg-tint"
      } ${className}`}
      {...rest}
    >
      {children}
      {badge === "dot" && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-ink bg-danger" />
      )}
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-4 border-2 border-ink bg-primary px-0.5 font-mono text-[9px] font-bold leading-[12px] text-ink">
          {badge}
        </span>
      )}
      <span
        className={`pointer-events-none absolute z-30 hidden ${tipBelow ? "top-full mt-1.5" : "bottom-full mb-1.5"} whitespace-nowrap bg-ink px-1.5 py-1 text-[10px] font-bold leading-none tracking-wide text-cream group-hover:block group-focus-visible:block ${anchor}`}
      >
        {label}
      </span>
    </button>
  );
}
