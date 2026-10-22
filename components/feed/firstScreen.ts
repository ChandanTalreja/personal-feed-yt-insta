import type { FeedVideo, GenreItem } from "@/components/types";
import type { NavSummary } from "@/components/TopBar";
import type { FeedChannel } from "./model";
import type { FeedReply } from "./useFeedData";

/** What lib/firstScreen.ts sends inside the page (audit B1). */
export interface FirstScreen {
  renderedAt: number;
  section: "feed" | "podcasts";
  feed: FeedReply;
  nav: NavSummary;
  channels: { channels: { channel: FeedChannel; videoCount: number; shortCount: number }[] };
  genres: { genres: GenreItem[] };
  suggestions: { suggestions: string[] };
  continued: { videos: FeedVideo[] } | null;
}

/** Older than this, it's a page reused from the router's 5-minute cache. */
const FRESH_MS = 60_000;
const used = new Set<number>();

/**
 * Trust the page's first screen instead of fetching it again: only when it
 * was made moments ago and hasn't been shown before. A page reused from the
 * router cache (PERF-03 keeps visited pages 5 minutes) carries old data, so
 * those mounts fetch as they always did. Pure, so React may call it twice.
 */
export function isFreshFirstScreen(first: FirstScreen | null | undefined): first is FirstScreen {
  return !!first && !used.has(first.renderedAt) && Date.now() - first.renderedAt < FRESH_MS;
}

/** After it's been shown (browser only, from an effect). */
export function markFirstScreenUsed(first: FirstScreen): void {
  used.add(first.renderedAt);
}
