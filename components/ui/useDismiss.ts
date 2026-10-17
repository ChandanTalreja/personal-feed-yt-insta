import { useEffect, useRef } from "react";

/**
 * Closes an open menu on Esc, or on a click anywhere outside it. Mark the
 * menu (its button and its panel) with a `data-menu` attribute; clicks inside
 * anything marked that way are left alone.
 */
export function useDismiss(open: boolean, onClose: () => void) {
  // The latest onClose, without re-subscribing on every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const handle = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest("[data-menu]")) return;
      close.current();
    };
    window.addEventListener("click", handle);
    window.addEventListener("keydown", handle);
    return () => {
      window.removeEventListener("click", handle);
      window.removeEventListener("keydown", handle);
    };
  }, [open]);
}
