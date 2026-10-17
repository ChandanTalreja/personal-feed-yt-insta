import type { ReactNode } from "react";

/**
 * The card an empty screen shows (REF-06): what this place is, why it's
 * empty, and the next step. `note` is the screen's one pen note, if it has one.
 */
export default function EmptyState({
  title,
  note,
  children,
  action,
  className = "mt-6",
}: {
  title: string;
  note?: string | null;
  /** One or two sentences: why it's empty. */
  children: ReactNode;
  /** The next step, usually a button. */
  action?: ReactNode;
  /** Spacing above the card. */
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-lg rounded-lg border border-line bg-surface p-8 text-center ${className}`}>
      <p className="font-display text-xl">{title}</p>
      {note && <p className="pen-note mt-2">{note}</p>}
      <p className="mt-2 text-sm text-muted">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
