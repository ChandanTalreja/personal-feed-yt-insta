import type { ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import type { SortKey } from "./model";

// Small pieces of the Channels table: the tick box, a sortable column header,
// a button on the dark bulk bar, and a row's ⋯ menu.

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border ${
        checked ? "border-ink bg-ink text-cream" : "border-muted/60 bg-surface hover:border-ink"
      }`}
    >
      {checked && <Icon name="check" size={12} />}
    </button>
  );
}

export function SortHeader({
  label,
  k,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  k: SortKey;
  className?: string;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
}) {
  const on = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`items-center gap-1 text-left uppercase hover:text-ink ${on ? "text-ink" : ""} ${className || "flex"}`}
      aria-label={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      {on && <Icon name={sort.dir === 1 ? "chevUp" : "chev"} size={12} />}
    </button>
  );
}

export function BarButton({
  children,
  onClick,
  danger = false,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-7 rounded-sm px-2.5 text-meta font-semibold ${
        danger
          ? "bg-danger text-white hover:brightness-110"
          : "border border-cream/40 text-cream hover:bg-cream hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function RowMenu({
  open,
  onToggle,
  onBackfill,
  items,
  onPicked,
}: {
  open: boolean;
  onToggle: () => void;
  /** "Backfill" row: one button per year window. */
  onBackfill: (years: number) => void;
  items: { label: string; onClick: () => void; danger?: boolean }[];
  onPicked: () => void;
}) {
  return (
    <div className="relative justify-self-end" data-menu>
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex h-7 w-7 items-center justify-center rounded-sm ${
          open ? "bg-ink text-cream" : "text-muted hover:bg-ink/5 hover:text-ink"
        }`}
      >
        <Icon name="more" size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border-[1.5px] border-ink bg-surface p-1 shadow-sticker">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="text-sm font-semibold">Backfill</p>
            <p className="text-xs text-muted">Fetch every upload from the last…</p>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    onPicked();
                    onBackfill(y);
                  }}
                  className="h-7 flex-1 rounded-sm border border-line text-xs font-semibold hover:border-ink hover:bg-primary"
                >
                  {y}Y
                </button>
              ))}
            </div>
          </div>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                onPicked();
                it.onClick();
              }}
              className={`block w-full rounded-sm px-2.5 py-2 text-left text-sm font-semibold hover:bg-ink/5 ${
                it.danger ? "text-danger" : ""
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
