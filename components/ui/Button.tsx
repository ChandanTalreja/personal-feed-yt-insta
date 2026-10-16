import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex select-none items-center justify-center gap-1.5 border-2 font-bold " +
  "transition-[transform,box-shadow] duration-75 disabled:pointer-events-none disabled:opacity-50";

// Primary is the one heavy element on a screen (yellow, bigger shadow);
// secondary is a quiet outlined button; ghost has no frame until hovered.
const variants: Record<Variant, string> = {
  primary:
    "border-ink bg-primary text-ink shadow-[4px_4px_0_var(--color-ink)] " +
    "hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-lg " +
    "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  secondary:
    "border-ink bg-surface text-ink shadow-hard " +
    "hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_var(--color-ink)] " +
    "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  ghost: "border-transparent bg-transparent text-ink hover:border-ink",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

/** Class string for anything that should look like a button (e.g. a Link). */
export function buttonClass(
  variant: Variant = "secondary",
  size: Size = "md",
  extra = ""
): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export default function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: Props) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest} />
  );
}
