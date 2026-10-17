import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import Icon from "./Icon";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size" | "className"> {
  value: string;
  onChange: (value: string) => void;
  /** Read by screen readers (the box has no visible label). */
  label: string;
  /** Show a ✕ that empties the box once something is typed. */
  clearable?: boolean;
  clearLabel?: string;
  /** What the ✕ does, if not just emptying the box through onChange. */
  onClear?: () => void;
  /** Esc empties the box (off when the caller uses Esc for something else). */
  escClears?: boolean;
  /** Shown at the right end while the box is empty, e.g. the ⌘K hint. */
  hint?: ReactNode;
  size?: "sm" | "md";
  /** Classes for the frame: width, background, corners. */
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * The one search/filter box: magnifier, input, optional ✕ — framed like every
 * field, with the yellow focus ring around the whole box.
 */
export default function SearchField({
  value,
  onChange,
  label,
  clearable = true,
  clearLabel = "Clear search",
  onClear,
  escClears = true,
  hint,
  size = "md",
  className = "",
  inputRef,
  onKeyDown,
  ...input
}: Props) {
  return (
    <label
      className={`field focus-within-ring flex items-center gap-2 ${
        size === "sm" ? "h-8 px-2.5" : "h-9 px-3"
      } ${className}`}
    >
      <Icon name="search" size={15} className="shrink-0 text-muted" />
      <input
        ref={inputRef}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (escClears && e.key === "Escape") onChange("");
          onKeyDown?.(e);
        }}
        aria-label={label}
        {...input}
      />
      {clearable && value ? (
        <button type="button" aria-label={clearLabel} className="text-muted hover:text-ink" onClick={() => (onClear ? onClear() : onChange(""))}>
          <Icon name="x" size={14} />
        </button>
      ) : (
        hint
      )}
    </label>
  );
}
