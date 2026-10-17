import type { ReactNode } from "react";

/**
 * The page-title pattern every screen shares (UI-03): a big title with its
 * handwritten pen note beside it (REF-07), then a summary line on the left and
 * the screen's controls on the right.
 */
export default function PageTitle({
  title,
  note,
  summary,
  children,
}: {
  title: string;
  /** The blue pen note: what makes this page different. One per screen. */
  note?: string;
  /** One line under the title, e.g. "699 to watch · about 261 hours". */
  summary?: ReactNode;
  /** Controls on the right of the summary line. */
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-display">{title}</h1>
        {note && <span className="pen-note">{note}</span>}
      </div>
      {(summary || children) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          {summary && <p className="text-lg text-muted">{summary}</p>}
          {children && <div className="ml-auto flex flex-wrap items-center gap-2.5">{children}</div>}
        </div>
      )}
    </header>
  );
}
