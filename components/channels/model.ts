import type { ChannelItem, GenreItem } from "@/components/types";
import { api } from "@/lib/api-client";

/** One channel in the table, with what it uploads and when. */
export interface Row {
  channel: ChannelItem;
  genre: GenreItem | null;
  videoCount: number;
  shortCount: number;
  lastUploadAt: string | null;
}

export type SortKey = "name" | "genre" | "videos" | "last";
export type StatusFilter = "all" | "quiet" | "paused";

/** No upload in this many days → "quiet": worth a look before it's pruned. */
export const QUIET_DAYS = 90;
const DAY = 86_400_000;

/** @handles, URLs, and raw channel ids identify one exact channel; plain
 *  names go through search and need a confirmation step. */
export function isExactInput(value: string): boolean {
  const t = value.trim();
  return t.includes("youtube.com") || t.startsWith("@") || /^UC[\w-]{20,}$/.test(t);
}

export function isQuiet(r: Row, now: number): boolean {
  return r.lastUploadAt == null || now - new Date(r.lastUploadAt).getTime() > QUIET_DAYS * DAY;
}

/** "Active", "Paused", or "No uploads 4 mo". */
export function statusOf(r: Row, now: number): { label: string; tone: "ok" | "paused" | "quiet" } {
  if (!r.channel.isActive) return { label: "Paused", tone: "paused" };
  if (r.lastUploadAt == null) return { label: "No uploads stored", tone: "quiet" };
  if (isQuiet(r, now)) {
    const months = Math.floor((now - new Date(r.lastUploadAt).getTime()) / (30.4 * DAY));
    return { label: `No uploads ${months} mo`, tone: "quiet" };
  }
  return { label: "Active", tone: "ok" };
}

/** "1 channel", "5 channels". */
export const plural = (n: number) => `${n} channel${n === 1 ? "" : "s"}`;

/**
 * Keeps calling /backfill with the server's bookmark until the window is done
 * (or `shouldStop` says so). Each call fits Netlify's 10-second limit.
 * Returns how many videos were added; `onProgress` gets the running total.
 */
export async function continueBackfill(
  id: number,
  years: number,
  cursor: string | null,
  onProgress: (added: number) => void,
  shouldStop: () => boolean = () => false
): Promise<number> {
  let added = 0;
  do {
    if (shouldStop()) break;
    const data = await api(`/api/channels/${id}/backfill`, {
      method: "POST",
      body: { years, cursor },
      fallback: "Couldn't fetch older videos. Please try again.",
    });
    added += data.videosAdded ?? 0;
    cursor = data.cursor;
    onProgress(added);
  } while (cursor);
  return added;
}

// Phones get three columns (tick · channel with a summary line · menu); from
// tablet width up, the full table. Shared by the header row and every row.
export const GRID =
  "grid grid-cols-[28px_minmax(0,1fr)_32px] items-center gap-x-3 " +
  "md:grid-cols-[36px_minmax(0,2.4fr)_minmax(0,1.3fr)_0.8fr_1fr_1.1fr_40px]";
export const WIDE = "hidden md:flex";
