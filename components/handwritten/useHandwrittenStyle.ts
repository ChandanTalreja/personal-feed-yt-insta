"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_STYLE, cleanStyle, type HandwrittenStyle } from "@/lib/handwritten/themes";

// Your paper, ink, hand and marks, remembered in this browser. A tiny store
// over localStorage: the server (and the first render) use the default
// School notebook, then React switches to what you picked last, without a
// hydration mismatch (that's what useSyncExternalStore's server snapshot is for).

const KEY = "tubebox:handwritten-style";
const listeners = new Set<() => void>();
let cache: { raw: string | null; style: HandwrittenStyle } = { raw: null, style: DEFAULT_STYLE };

function read(): HandwrittenStyle {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  // Same text → same object, so React doesn't re-render for nothing.
  if (raw !== cache.raw) {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {}
    cache = { raw, style: cleanStyle(parsed) };
  }
  return cache.style;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useHandwrittenStyle(): [HandwrittenStyle, (change: Partial<HandwrittenStyle>) => void] {
  const style = useSyncExternalStore(subscribe, read, () => DEFAULT_STYLE);
  const update = useCallback((change: Partial<HandwrittenStyle>) => {
    const next = cleanStyle({ ...read(), ...change });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage refused (a private window): keep the choice for this visit.
      cache = { raw: cache.raw, style: next };
    }
    listeners.forEach((l) => l());
  }, []);
  return [style, update];
}
