import type { ReactNode } from "react";
import Icon from "./Icon";
import IconButton from "./IconButton";

interface Props {
  /** Heading area: usually a title, or a thumbnail + title block. */
  header: ReactNode;
  onClose: () => void;
  /** Optional row under the header (e.g. Watch / Add to track). */
  actions?: ReactNode;
  /** Optional tab strip under the actions. */
  tabs?: ReactNode;
  /** Optional strip pinned under the body (e.g. the Ask box). */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The right-hand panel (study panel, notebook reader…). Header and tabs stay
 * put; only the body scrolls.
 */
export default function SidePanel({ header, onClose, actions, tabs, footer, children }: Props) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-surface">
      <div className="flex items-start gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1">{header}</div>
        <IconButton label="Close" align="right" tipBelow onClick={onClose}>
          <Icon name="x" size={16} />
        </IconButton>
      </div>
      {actions && <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">{actions}</div>}
      {tabs && <div className="border-b border-line">{tabs}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {footer && <div className="border-t border-line p-4">{footer}</div>}
    </aside>
  );
}
