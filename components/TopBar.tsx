"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Mascot from "./Mascot";
import { buttonClass } from "./ui/Button";
import Icon from "./ui/Icon";
import IconButton from "./ui/IconButton";
import GlobalSearch from "./GlobalSearch";
import { NAV_CHANGED } from "@/lib/nav-events";

interface NavSummary {
  inbox: number;
  notebook: number;
  tracks: number;
  lastSyncAt: string | null;
}

const TABS: { href: string; label: string; count?: keyof NavSummary }[] = [
  { href: "/", label: "Feed", count: "inbox" },
  { href: "/notebook", label: "Notebook", count: "notebook" },
  { href: "/tracks", label: "Tracks", count: "tracks" },
  { href: "/channels", label: "Channels" },
];

/** "Synced just now", "Synced 4 min ago", "Synced 3 h ago", "Synced 2 d ago". */
function syncedLabel(iso: string | null, now: number): string {
  if (!iso) return "Not synced yet";
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours} h ago`;
  return `Synced ${Math.floor(hours / 24)} d ago`;
}

/** The refresh result in plain words. */
function syncMessage(data: {
  added: number;
  channels: number;
  breakdown?: { title: string; added: number }[];
}): string {
  if (data.added === 0) {
    return `You're up to date — checked ${data.channels} channels, nothing new.`;
  }
  const list = data.breakdown ?? [];
  const shown = list
    .slice(0, 4)
    .map((b) => `${b.title} (${b.added})`)
    .join(", ");
  const more = list.length > 4 ? ` and ${list.length - 4} more` : "";
  return `${data.added} new video${data.added === 1 ? "" : "s"} — ${shown}${more}.`;
}

/**
 * The bar at the top of every page: logo, the four sections with counts,
 * sync status, and the one primary action. `onRefreshed` lets a page reload
 * its own data after a sync (the feed uses it).
 */
export default function TopBar({
  onRefreshed,
  flush = false,
}: {
  onRefreshed?: () => void | Promise<void>;
  /** No gap under the bar — for pages whose columns start right below it (the feed). */
  flush?: boolean;
}) {
  const pathname = usePathname();
  const [nav, setNav] = useState<NavSummary | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadNav = useCallback(async () => {
    const res = await fetch("/api/nav");
    if (res.ok) setNav(await res.json());
  }, []);

  useEffect(() => {
    // Async fetch, not a synchronous state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNav().catch(() => {});
    // Recount when a page says something changed. Debounced, so a burst of
    // changes (ticking off five videos) costs one recount, not five.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onChanged = () => {
      clearTimeout(pending);
      pending = setTimeout(() => loadNav().catch(() => {}), 400);
    };
    window.addEventListener(NAV_CHANGED, onChanged);
    // Keep "Synced N min ago" honest without refetching.
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(pending);
      clearInterval(tick);
      window.removeEventListener(NAV_CHANGED, onChanged);
    };
  }, [loadNav]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/cron");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setToast(syncMessage(data));
      setNow(Date.now());
      await Promise.all([loadNav(), onRefreshed?.()]);
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className={`sticky top-0 z-40 ${flush ? "" : "mb-6"}`}>
      <nav
        aria-label="Main"
        className="flex flex-wrap items-stretch border-b-2 border-ink bg-panel"
      >
        {/* Logo — hover shows the tagline as a speech bubble from the TV. */}
        <Link
          href="/"
          aria-label="TUBEBOX — your feed, no algorithm"
          className="group relative flex items-center gap-2 border-r-2 border-ink px-4 py-2"
        >
          <Mascot size={40} />
          <span className="font-display text-xl">TUBEBOX</span>
          <span
            role="tooltip"
            className="pointer-events-none absolute left-6 top-full z-50 mt-2 hidden whitespace-nowrap border-2 border-ink bg-surface px-2.5 py-1.5 text-xs font-bold shadow-hard group-hover:block group-focus-visible:block"
          >
            <span className="absolute -top-[7px] left-3 h-3 w-3 rotate-45 border-l-2 border-t-2 border-ink bg-surface" />
            your feed · no algorithm
          </span>
        </Link>

        {TABS.map((tab) => {
          const active = isActive(tab.href);
          const n = tab.count && nav ? (nav[tab.count] as number) : null;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 border-r-2 border-ink px-4 py-2 text-sm font-bold transition-colors ${
                active ? "bg-ink text-cream" : "hover:bg-primary/40"
              }`}
            >
              {tab.label}
              {n != null && (
                <span
                  className={`border-[1.5px] px-1.5 font-mono text-[11px] font-bold ${
                    active ? "border-primary bg-primary text-ink" : "border-ink bg-primary text-ink"
                  }`}
                >
                  {n}
                </span>
              )}
            </Link>
          );
        })}

        {/* Global search: its own full-width row on phones, inline from tablet up. */}
        <div className="order-last flex w-full items-center border-t-2 border-ink px-4 py-2 md:order-none md:ml-auto md:w-auto md:border-t-0 md:py-0">
          <div className="w-full md:w-auto">
            <GlobalSearch />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 px-4 py-2 md:ml-0">
          <span className="font-mono text-xs font-bold text-ink/80">
            {nav ? syncedLabel(nav.lastSyncAt, now) : ""}
          </span>
          <IconButton
            label={syncing ? "Syncing…" : "Check YouTube for new videos"}
            align="right"
            tipBelow
            onClick={sync}
            disabled={syncing}
            className="h-9 min-w-9 shadow-hard-sm"
          >
            <Icon name="refresh" size={17} className={syncing ? "animate-spin" : ""} />
          </IconButton>
          <Link href="/channels#add" className={buttonClass("primary", "sm")}>
            <Icon name="plus" size={14} strokeWidth={3} />
            Add channel
          </Link>
        </div>
      </nav>

      {toast && (
        <div className="absolute right-4 top-full mt-2 max-w-md border-2 border-ink bg-primary px-3 py-2 text-sm font-bold shadow-hard">
          {toast}
        </div>
      )}
    </div>
  );
}
