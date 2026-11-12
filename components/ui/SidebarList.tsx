import type { ReactNode } from "react";

/** A titled group in the left sidebar (Your feed, Genres, Channels). */
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
    <section className="px-3 [&+&]:mt-5">
      <div className="mb-1.5 flex items-center justify-between px-2.5">
        <h3 className="label-caps">{title}</h3>
        {aside}
      </div>
      <ul className="space-y-px">{children}</ul>
    </section>
  );
}

/** One clickable row: optional tile/colour square/avatar, label, count. */
export function SidebarItem({
  label,
  count,
  active = false,
  leading,
  onClick,
  marker,
  muted = false,
  highlight = false,
  action,
}: {
  label: string;
  count?: number | string;
  active?: boolean;
  leading?: ReactNode;
  onClick?: () => void;
  /** A small grey mark after the label (a hidden genre's crossed-out eye). */
  marker?: ReactNode;
  /** Faded: the row is set aside (a genre hidden from All genres). */
  muted?: boolean;
  /** The count in the red pen ("3 New!"), to catch the eye. */
  highlight?: boolean;
  /** A small button over the count's place, shown on hover or keyboard focus. */
  action?: ReactNode;
}) {
  return (
    <li className="group/item relative">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={`flex h-[34px] w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm transition-colors ${
          active ? "bg-surface font-semibold shadow-[inset_0_0_0_1px_var(--color-line)]" : "hover:bg-ink/5"
        } ${muted && !active ? "text-muted" : ""}`}
      >
        {leading && <span className={`flex shrink-0 ${muted ? "opacity-45" : ""}`}>{leading}</span>}
        <span className="min-w-0 truncate">{label}</span>
        {marker && <span className="flex shrink-0 text-muted">{marker}</span>}
        <span className="flex-1" />
        {count != null && (
          <span
            className={`shrink-0 ${
              highlight
                ? "pen-new"
                : active
                  ? "rounded-xs bg-primary px-1.5 text-ink"
                  : "text-muted"
            } ${highlight ? "" : "font-mono text-xs"} ${action ? "group-hover/item:invisible group-focus-within/item:invisible" : ""}`}
          >
            {count}
          </span>
        )}
      </button>
      {action && (
        <span className="absolute inset-y-0 right-1.5 flex items-center opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100">
          {action}
        </span>
      )}
    </li>
  );
}

/** A soft colour tile with an icon, for the feed views (Inbox, Watch later…). */
export function SidebarTile({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-ink ${className}`}>
      {children}
    </span>
  );
}
