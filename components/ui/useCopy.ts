import { useState } from "react";

/**
 * Copy text to the clipboard and say so: `copied` is true for a couple of
 * seconds after a copy. `copy` resolves false when the browser refuses
 * (the clipboard needs a secure context: https or localhost).
 */
export function useCopy(showFor = 2000) {
  const [copied, setCopied] = useState(false);

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), showFor);
      return true;
    } catch {
      return false;
    }
  }

  return { copied, copy };
}
