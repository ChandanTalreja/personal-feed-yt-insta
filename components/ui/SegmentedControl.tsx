interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Read by screen readers, e.g. "Video length". */
  label: string;
  size?: "sm" | "md";
}

/**
 * A row of mutually exclusive choices in one frame (Videos | Shorts,
 * Any length | <10m | …). The current choice is filled black.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: Props<T>) {
  const pad = size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-meta";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-line bg-surface p-[3px]"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`${pad} select-none whitespace-nowrap rounded-[5px] font-semibold transition-colors ${
              on ? "bg-ink text-cream" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
