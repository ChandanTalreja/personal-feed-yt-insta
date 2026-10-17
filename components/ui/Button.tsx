import type { ButtonHTMLAttributes } from "react";
import Spinner from "./Spinner";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border " +
  "transition-[transform,box-shadow,border-color,background-color] duration-100 " +
  "disabled:pointer-events-none disabled:opacity-50";

// Primary is yellow with an ink edge. At full size it's the screen's one
// "sticker" (hard shadow at rest); small primaries earn the shadow on hover.
// Secondary is a quiet framed button; ghost has no frame until hovered.
const variants: Record<Variant, Record<Size, string>> = {
  primary: {
    md:
      "border-[1.5px] border-ink bg-primary font-bold text-ink shadow-sticker " +
      "hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_var(--color-ink)] " +
      "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
    sm:
      "border-[1.5px] border-ink bg-primary font-bold text-ink " +
      "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_var(--color-ink)] " +
      "active:translate-x-0 active:translate-y-0 active:shadow-none",
  },
  secondary: {
    md: "icon-hover border-line bg-surface font-semibold text-ink hover:border-ink",
    sm: "icon-hover border-line bg-surface font-semibold text-ink hover:border-ink",
  },
  ghost: {
    md: "icon-hover border-transparent bg-transparent font-semibold text-ink hover:bg-ink/5",
    sm: "icon-hover border-transparent bg-transparent font-semibold text-ink hover:bg-ink/5",
  },
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-meta",
  md: "h-9 px-4 text-sm",
};

/** Class string for anything that should look like a button (e.g. a Link). */
export function buttonClass(
  variant: Variant = "secondary",
  size: Size = "md",
  extra = ""
): string {
  return `${base} ${variants[variant][size]} ${sizes[size]} ${extra}`.trim();
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Waiting on a request: spinner + `busyLabel`, and the button is disabled. */
  busy?: boolean;
  busyLabel?: string;
}

export default function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  busyLabel = "Please wait",
  className = "",
  type = "button",
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? <Spinner label={busyLabel} size={size === "sm" ? 13 : 15} /> : children}
    </button>
  );
}
