import type { ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import { useCopy } from "@/components/ui/useCopy";

// Controls in the Notebook's list column: the two filter dropdowns and the
// ⋯ menu's "Copy all".

/** A native select dressed as a field: keyboard and screen readers come free. */
export function Dropdown({
  label,
  value,
  onChange,
  options,
  disabled = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={`relative flex min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border pl-3 pr-8 text-meta font-semibold transition-colors disabled:cursor-default disabled:opacity-60 ${
          value && value !== "all" ? "border-ink bg-primary/35" : "border-line bg-surface hover:border-ink"
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chev" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </label>
  );
}

/** "Copy all shown" in the ⋯ menu. */
export function CopyAllItem({ text, count, onDone }: { text: () => string; count: number; onDone: () => void }) {
  const { copied, copy } = useCopy();
  return (
    <MenuItem
      onClick={async () => {
        // Show "Copied" briefly, then close the menu (straight away if it failed).
        const ok = await copy(text());
        setTimeout(onDone, ok ? 900 : 0);
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : `Copy all ${count} shown, as Markdown`}
    </MenuItem>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-semibold hover:bg-ink/5"
    >
      {children}
    </button>
  );
}
