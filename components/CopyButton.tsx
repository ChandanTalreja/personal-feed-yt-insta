"use client";

import { useState } from "react";
import Icon from "./ui/Icon";

/**
 * Small copy-to-clipboard chip with a transient "COPIED ✓" confirmation.
 * Shared by every AI output panel (summary, ask answers, transcript).
 */
export default function CopyButton({
  text,
  quiet = false,
}: {
  text: string;
  /** Redesign style: a plain "⧉ Copy" link instead of a chip. */
  quiet?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context (https/localhost); ignore failures.
    }
  }

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
      className="nb-chip icon-hover flex h-7 shrink-0 items-center gap-1 rounded-sm px-2 text-xs"
      onClick={copy}
      title="Copy to the clipboard"
    >
      <Icon name={copied ? "check" : "copy"} size={13} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
