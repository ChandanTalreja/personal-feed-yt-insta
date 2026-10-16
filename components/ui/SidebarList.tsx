import type { ReactNode } from "react";

/** A titled group in the left sidebar (Views, Genres, Channels). */
export function SidebarSection({
  title,
  aside,
  children,
}: {
  title: string;
  /** Right side of the title row, e.g. a total or a "+ New" link. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b-2 border-ink py-3 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between px-4">
        <h3 className="font-display text-[11px] tracking-widest text-ink">{title}</h3>
        {aside}
      </div>
      <ul>{children}</ul>
    </section>
  );
}

/** One clickable row: optional colour square/avatar, label, count. */
export function SidebarItem({
  label,
  count,
  active = false,
  leading,
  onClick,
}: {
  label: string;
  count?: number | string;
  active?: boolean;
  leading?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-2.5 border-l-4 px-3 py-1.5 text-left text-sm transition-colors ${
          active ? "border-ink bg-primary font-bold" : "border-transparent hover:bg-primary/35"
        }`}
      >
        {leading}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count != null && (
          <span
            className={`shrink-0 border-[1.5px] border-ink px-1 font-mono text-[11px] font-bold leading-4 ${
              active ? "bg-surface" : "bg-primary"
            }`}
          >
            {count}
          </span>
        )}
      </button>
    </li>
  );
}
