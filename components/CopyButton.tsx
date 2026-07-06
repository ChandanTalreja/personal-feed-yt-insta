"use client";

import { useState } from "react";

/**
 * Small copy-to-clipboard chip with a transient "COPIED ✓" confirmation.
 * Shared by every AI output panel (summary, ask answers, transcript).
 */
export default function CopyButton({ text }: { text: string }) {
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

  return (
    <button
      type="button"
      className="nb-chip shrink-0 rounded px-1.5 py-0.5 text-[10px]"
      onClick={copy}
      title="Copy to the clipboard"
    >
      {copied ? "COPIED ✓" : "COPY"}
    </button>
  );
}
