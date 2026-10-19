"use client";

import { useEffect, useRef, useState } from "react";
import { notifyNavChanged } from "@/lib/nav-events";
import {
  OFFLINE_MESSAGE,
  PENDING_CHANGED,
  PENDING_RESTORED,
  flushPending,
  isOffline,
  pendingCount,
} from "@/lib/offline";

/** While changes are waiting but the browser claims to be online, retry this often. */
const RETRY_MS = 15_000;

/**
 * The bar at the bottom of every page when the connection drops, and the one
 * place that sends the waiting list (lib/offline.ts) when it's back, so a
 * change saves even if you've moved to another page meanwhile.
 */
export default function OfflineBar() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const flushing = useRef(false);

  useEffect(() => {
    async function flush(restored = false) {
      if (flushing.current || isOffline() || pendingCount() === 0) return;
      flushing.current = true;
      try {
        const { saved, refused, left } = await flushPending();
        if (saved > 0) notifyNavChanged();
        // Changes from an earlier visit: the feed loaded without them, so it reloads.
        if (restored && saved > 0) window.dispatchEvent(new Event(PENDING_RESTORED));
        if (left > 0) return; // still can't reach the server
        if (refused > 0) setMessage("Some changes couldn't be saved. Please redo them.");
        else if (saved > 0) setMessage(restored ? "Your earlier changes were saved." : "Back online. All changes saved.");
      } finally {
        flushing.current = false;
      }
    }

    // Async browser state, not a synchronous render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffline(isOffline());
    setPending(pendingCount());
    flush(true); // anything left from before a reload

    const onOffline = () => {
      setOffline(true);
      setMessage(null);
    };
    const onOnline = () => {
      setOffline(false);
      flush();
    };
    const onPending = () => setPending(pendingCount());
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener(PENDING_CHANGED, onPending);
    // A save can fail on the network while the browser still says "online"
    // (flaky Wi-Fi); keep trying quietly until the list is empty.
    const retry = setInterval(() => flush(), RETRY_MS);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(PENDING_CHANGED, onPending);
      clearInterval(retry);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  const text = offline
    ? pending > 0
      ? `${OFFLINE_MESSAGE} (${pending} waiting)`
      : "You're offline. Changes you make will save when you're back online."
    : message;
  if (!text) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-5 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md border-[1.5px] border-ink px-4 py-2.5 text-sm font-semibold shadow-sticker ${
        offline ? "bg-ink text-cream" : "bg-surface text-ink"
      }`}
    >
      {text}
    </div>
  );
}
