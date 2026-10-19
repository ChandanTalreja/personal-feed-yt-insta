"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Mascot from "./Mascot";
import { buttonClass } from "./ui/Button";
import Icon from "./ui/Icon";
import IconButton from "./ui/IconButton";
import { SpinnerBadge } from "./ui/Spinner";
import GlobalSearch from "./GlobalSearch";
import { NAV_CHANGED } from "@/lib/nav-events";
import { api, rememberedReply } from "@/lib/api-client";

interface NavSummary {
  inbox: number;
  notebook: number;
  tracks: number;
  lastSyncAt: string | null;
  /** Channels the last sync couldn't check (optional: older remembered replies lack it). */
  lastSyncFailed?: string[];
}

/** "X, Y and 3 more" — channel names for a short message. */
function nameList(titles: string[], max = 3): string {
  const shown = titles.slice(0, max).join(", ");
  return titles.length > max ? `${shown} and ${titles.length - max} more` : shown;
}

const TABS: { href: string; label: string; count?: keyof NavSummary }[] = [
  { href: "/", label: "Feed", count: "inbox" },
  { href: "/notebook", label: "Notebook", count: "notebook" },
  { href: "/tracks", label: "Tracks", count: "tracks" },
  { href: "/channels", label: "Channels" },
];

/** "Synced just now", "Synced 4m ago", "Synced 3h ago", "Synced 2d ago". */
function syncedLabel(iso: string | null, now: number): string {
  if (!iso) return "Not synced yet";
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${Math.floor(hours / 24)}d ago`;
}

/**
 * The refresh result in plain words — including channels that couldn't be
 * checked, so a failure never hides behind "you're up to date".
 */
function syncMessage(data: {
  added: number;
  channels: number;
  failed?: string[];
  breakdown?: { title: string; added: number }[];
}): string {
  const failed = data.failed ?? [];
  const checked = data.channels - failed.length;
  let result: string;
  if (data.added === 0) {
    result = failed.length
      ? `Nothing new in the ${checked} channels checked.`
      : `You're up to date. Checked ${data.channels} channels, nothing new.`;
  } else {
    const list = data.breakdown ?? [];
    const shown = list
      .slice(0, 4)
      .map((b) => `${b.title} (${b.added})`)
      .join(", ");
    const more = list.length > 4 ? ` and ${list.length - 4} more` : "";
    result = `${data.added} new video${data.added === 1 ? "" : "s"}: ${shown}${more}.`;
  }
  if (!failed.length) return result;
  return (
    `${result} Couldn't check ${failed.length} channel${failed.length === 1 ? "" : "s"}: ` +
    `${nameList(failed)}. They'll be retried on the next sync.`
  );
}

/**
 * The yellow marker (REF-07): a slightly tilted felt-tip stroke under the
 * active tab — "you are here". Thicker in the middle, like a real marker.
 */
function MarkerStroke() {
  return (
    <svg
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-[9px] left-[-6%] h-3 w-[112%] overflow-visible opacity-0 transition-opacity duration-150 group-hover:opacity-45 group-aria-[current=page]:opacity-100"
    >
      <path
        d="M3 8.5 C 28 4.5, 62 3.5, 97 5.5"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="5.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The bar at the top of every page: logo, the four sections with counts,
 * global search, sync status, and the one sticker button. `onRefreshed` lets
 * a page reload its own data after a sync (the feed uses it).
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
  // The counts remembered in this tab show at once on every page; then refresh.
  const [nav, setNav] = useState<NavSummary | null>(() => rememberedReply<NavSummary>("/api/nav") ?? null);
  const [now, setNow] = useState(() => Date.now());
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadNav = useCallback(async () => {
    try {
      setNav(await api<NavSummary>("/api/nav"));
    } catch {
      // Counts that fail to refresh keep their last value (as before).
    }
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
      const data = await api("/api/cron", { fallback: "Couldn't check for new videos. Please try again." });
      setToast(syncMessage(data));
      setNow(Date.now());
      await Promise.all([loadNav(), onRefreshed?.()]);
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const failedChannels = nav?.lastSyncFailed ?? [];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className={`sticky top-0 z-40 ${flush ? "" : "mb-8"}`}>
      <nav
        aria-label="Main"
        className="flex min-h-16 flex-wrap items-center gap-x-3 border-b border-line bg-cream px-4 md:gap-x-6 md:px-6"
      >
        {/* Logo — hover shows the tagline as a speech bubble from the TV. */}
        <Link
          href="/"
          aria-label="TUBEBOX: your feed, no algorithm"
          className="group relative flex items-center gap-2.5 py-3"
        >
          <Mascot size={34} />
          <span className="font-display text-xl">TUBEBOX</span>
          <span
            role="tooltip"
            className="pointer-events-none absolute left-[80px] top-[calc(100%-4px)] z-50 hidden whitespace-nowrap rounded-sm border border-ink bg-surface px-2.5 pb-1 pt-0.5 shadow-sticker group-hover:block group-focus-visible:block"
          >
            <span className="absolute -top-[6px] left-3 h-2.5 w-2.5 rotate-45 border-l border-t border-ink bg-surface" />
            {/* The tagline, in the blue pen (REF-07): personality when you reach
                for the logo. Smaller than a title's note (.pen-note is 23px and
                unlayered, so a Tailwind size class wouldn't win), and it starts
                under the word, clear of the sidebar's "Your feed" heading. */}
            <span className="pen-note" style={{ fontSize: "1.125rem" }}>your feed, no algorithm</span>
          </span>
        </Link>

        {/* Phones: the tabs get their own row (and scroll if they must). */}
        <div className="order-2 -mx-2 flex w-[calc(100%+1rem)] items-center gap-0.5 overflow-x-auto pb-2.5 [scrollbar-width:none] md:order-none md:gap-1 md:mx-0 md:w-auto md:overflow-visible md:pb-0">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const n = tab.count && nav ? (nav[tab.count] as number) : null;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`group flex shrink-0 items-center gap-1.5 px-2 py-2 text-sm font-semibold transition-colors md:gap-2 md:px-3 ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <span className="relative">
                  {tab.label}
                  <MarkerStroke />
                </span>
                {n != null && <span className={`font-mono text-xs font-normal ${active ? "text-ink" : "text-muted"}`}>{n}</span>}
              </Link>
            );
          })}
        </div>

        {/* Global search: its own full-width row on phones, inline from tablet up. */}
        <div className="order-last w-full pb-3 md:order-none md:ml-auto md:w-auto md:pb-0">
          <GlobalSearch />
        </div>

        {/* Sync status and its button sit together as one group. */}
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {syncing ? (
            <SpinnerBadge label="Syncing" />
          ) : (
            <span
              className="flex items-center gap-2 whitespace-nowrap text-meta text-muted"
              title={
                nav
                  ? syncedLabel(nav.lastSyncAt, now) +
                    (failedChannels.length
                      ? `. Couldn't check ${nameList(failedChannels, 8)}, they'll be retried on the next sync.`
                      : "")
                  : undefined
              }
            >
              {nav && (
                <>
                  {/* Green: every channel checked. Amber: some couldn't be (hover for which). */}
                  <span
                    className={`h-[7px] w-[7px] rounded-full ${
                      failedChannels.length
                        ? "bg-warn shadow-[0_0_0_3px_rgb(154_88_0/0.2)]"
                        : "bg-ok shadow-[0_0_0_3px_rgb(47_179_107/0.18)]"
                    }`}
                  />
                  <span className="hidden xl:inline">{syncedLabel(nav.lastSyncAt, now)}</span>
                </>
              )}
            </span>
          )}
          <IconButton
            label={syncing ? "Syncing…" : "Check YouTube for new videos"}
            align="right"
            tipBelow
            onClick={sync}
            disabled={syncing}
            className="h-9 min-w-9 [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:rotate-90"
          >
            <Icon name="refresh" size={18} />
          </IconButton>
        </div>
        <Link href="/channels#add" aria-label="Add channel" className={buttonClass("primary", "md", "px-2.5 xl:px-4")}>
          <Icon name="plus" size={15} />
          <span className="hidden xl:inline">Add channel</span>
        </Link>
      </nav>

      {toast && (
        <div role="status" className="absolute right-4 top-full mt-2 max-w-md rounded-md border-[1.5px] border-ink bg-surface px-3 py-2 text-sm font-semibold shadow-sticker">
          {toast}
        </div>
      )}
    </div>
  );
}
