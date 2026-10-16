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
 * Any length | < 10m | …). The current choice is filled black.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: Props<T>) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex border-2 border-ink bg-surface shadow-hard-sm"
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`${pad} select-none font-bold transition-colors ${
              i > 0 ? "border-l-2 border-ink" : ""
            } ${on ? "bg-ink text-cream" : "text-ink hover:bg-tint"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
