import Icon from "./Icon";

/**
 * The one waiting indicator (REDESIGN §2 v2 → Waiting): a round arc that
 * spins, always with a word saying what's happening ("Syncing",
 * "Thinking…"). Idea from neobrutalism.dev's Spinner.
 */
export default function Spinner({
  label,
  size = 15,
  className = "",
}: {
  label: string;
  size?: number;
  className?: string;
}) {
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 ${className}`}>
      <Icon name="spinner" size={size} className="animate-spin" />
      {label}
    </span>
  );
}

/** The same spinner in a small bordered badge, for a status line ("Syncing"). */
export function SpinnerBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-7 items-center rounded-sm border-[1.5px] border-ink bg-surface px-2.5 text-meta font-semibold text-ink">
      <Spinner label={label} size={14} />
    </span>
  );
}
