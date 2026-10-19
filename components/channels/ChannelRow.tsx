import Icon from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Media";
import type { GenreItem } from "@/components/types";
import { timeAgo } from "@/lib/format";
import { GRID, statusOf, type Row } from "./model";
import { Checkbox, RowMenu } from "./TableParts";

/** One channel in the Channels table. Clicking the row (not a control) ticks it. */
export default function ChannelRow({
  r,
  now,
  on,
  genres,
  working,
  menuOpen,
  onToggle,
  onMove,
  onBackfill,
  onPause,
  onDelete,
  onMenu,
  onMenuPicked,
}: {
  r: Row;
  now: number;
  /** Ticked. */
  on: boolean;
  genres: GenreItem[];
  /** A bulk job is running (disables "Try backfilling"). */
  working: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  onMove: (genreId: number | null) => void;
  onBackfill: (years: number) => void;
  onPause: (pause: boolean) => void;
  /** Starts the delete confirmation for this row. */
  onDelete: () => void;
  onMenu: () => void;
  onMenuPicked: () => void;
}) {
  const status = statusOf(r, now);
  const g = r.genre;
  return (
    <li
      // Clicking anywhere on a row (except its controls) ticks it.
      onClick={(e) => {
        if ((e.target as Element).closest("button, select, a, input, label")) return;
        onToggle();
      }}
      className={`${GRID} cursor-pointer border-t border-line px-4 py-2.5 first:border-t-0 transition-colors ${
        on ? "bg-primary/15" : "hover:bg-ink/[0.03]"
      }`}
    >
      <Checkbox checked={on} onChange={() => onToggle()} label={`Select ${r.channel.title}`} />
      <div className={`flex min-w-0 items-center gap-3 ${r.channel.isActive ? "" : "opacity-55"}`}>
        <Avatar src={r.channel.thumbnail} name={r.channel.title} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={r.channel.title}>
            {r.channel.title}
          </p>
          <p className="truncate text-meta text-muted">{r.channel.handle ?? r.channel.ytChannelId}</p>
          {/* Phones: the hidden columns, as one line. */}
          <p className="mt-0.5 truncate text-meta text-muted md:hidden">
            {g?.name ?? "No genre"} · {r.videoCount + r.shortCount} videos ·{" "}
            {r.lastUploadAt ? timeAgo(r.lastUploadAt) : "None yet"} ·{" "}
            <span className={status.tone === "quiet" ? "text-warn" : ""}>{status.label}</span>
          </p>
        </div>
      </div>
      {/* Genre: a chip that's really a select, so changing one row is one click. */}
      <label className="relative hidden min-w-0 max-w-full items-center justify-self-start rounded-sm border border-line bg-surface hover:border-ink md:flex">
        <span
          className="pointer-events-none absolute left-2.5 h-2 w-2 rounded-full"
          style={{ backgroundColor: g?.color ?? "var(--color-line)" }}
        />
        <select
          className="h-7 min-w-0 cursor-pointer appearance-none truncate bg-transparent pl-6 pr-6 text-meta font-medium outline-none"
          value={r.channel.genreId ?? ""}
          onChange={(e) => onMove(e.target.value ? Number(e.target.value) : null)}
          aria-label={`Genre for ${r.channel.title}`}
        >
          <option value="">No genre</option>
          {genres.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <Icon name="chev" size={12} className="pointer-events-none absolute right-2 text-muted" />
      </label>
      <span className="hidden font-mono text-meta md:block">
        {r.videoCount}
        {r.shortCount > 0 && (
          <span className="ml-1.5 text-xs text-muted">+{r.shortCount} shorts</span>
        )}
      </span>
      <span className="hidden text-meta text-muted md:block">
        {r.lastUploadAt ? timeAgo(r.lastUploadAt) : "None yet"}
      </span>
      <span
        className={`hidden items-center gap-1.5 text-meta font-semibold md:flex ${
          status.tone === "quiet" ? "text-warn" : status.tone === "paused" ? "text-muted" : ""
        }`}
      >
        {status.tone === "paused" && <Icon name="pause" size={12} duotone={false} />}
        <span className="flex flex-col items-start">
          {status.label}
          {/* Nothing in the window it was added with — likely a
              channel that posts rarely. Offer to look further back. */}
          {r.lastUploadAt == null && r.channel.isActive && (
            <button
              type="button"
              disabled={working}
              onClick={() => onBackfill(3)}
              className="mt-0.5 text-xs font-semibold text-ink underline decoration-primary decoration-2 underline-offset-2 hover:decoration-ink disabled:opacity-50"
            >
              Try backfilling 3 years
            </button>
          )}
        </span>
      </span>
      <RowMenu
        open={menuOpen}
        onToggle={onMenu}
        onBackfill={onBackfill}
        items={[
          r.channel.isActive
            ? { label: "Pause", onClick: () => onPause(true) }
            : { label: "Resume", onClick: () => onPause(false) },
          {
            label: "Delete…",
            danger: true,
            // Same confirm step as bulk delete, for just this row.
            onClick: onDelete,
          },
        ]}
        onPicked={onMenuPicked}
      />
    </li>
  );
}
