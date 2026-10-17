"use client";

import Icon from "./ui/Icon";
import { useCopy } from "./ui/useCopy";

/**
 * Copy-to-clipboard with a short "Copied" confirmation. Shared by every AI
 * output (summary, Ask answers, transcript) and notes.
 */
export default function CopyButton({
  text,
  quiet = false,
}: {
  text: string;
  /** A plain "Copy" link instead of a chip. */
  quiet?: boolean;
}) {
  const { copied, copy: copyText } = useCopy();
  const copy = () => copyText(text);

  if (quiet) {
    return (
      <button
        type="button"
        className="icon-hover flex shrink-0 items-center gap-1 text-meta font-semibold text-muted hover:text-ink"
        onClick={copy}
      >
        <Icon name={copied ? "check" : "copy"} size={14} />
        {copied ? "Copied" : "Copy"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="chip icon-hover flex h-7 shrink-0 items-center gap-1 rounded-sm px-2 text-xs"
      onClick={copy}
      title="Copy to the clipboard"
    >
      <Icon name={copied ? "check" : "copy"} size={13} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
