import { eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { channels, videos, type Channel } from "./schema";
import { getVideoDetails, isShortVideo, listUploadsSince } from "./youtube";

export function backfillSince(): Date {
  const months = Number(process.env.BACKFILL_MONTHS) || 6;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

/**
 * Fetches uploads for one channel published after `since` and inserts the
 * ones we don't have yet. Used both for the initial backfill (since = 6
 * months ago) and by the cron (since = a short lookback window; the unique
 * yt_video_id constraint makes overlapping runs harmless).
 */
export async function ingestChannel(
  db: Db,
  channel: Pick<Channel, "id" | "uploadsPlaylistId">,
  since: Date
): Promise<number> {
  const ids = await listUploadsSince(channel.uploadsPlaylistId, since);
  if (ids.length === 0) return 0;

  const existing = await db
    .select({ ytVideoId: videos.ytVideoId })
    .from(videos)
    .where(inArray(videos.ytVideoId, ids));
  const existingIds = new Set(existing.map((v) => v.ytVideoId));
  const freshIds = ids.filter((id) => !existingIds.has(id));
  if (freshIds.length === 0) return 0;

  const details = await getVideoDetails(freshIds);
  const shortFlags = await Promise.all(
    details.map((d) => isShortVideo(d.ytVideoId, d.durationSeconds, d.isLive))
  );
  const rows = details.map((d, i) => ({
    ytVideoId: d.ytVideoId,
    channelId: channel.id,
    title: d.title,
    thumbnail: d.thumbnail,
    durationSeconds: d.durationSeconds,
    isShort: shortFlags[i],
    isLive: d.isLive,
    publishedAt: d.publishedAt,
  }));

  if (rows.length > 0) {
    await db.insert(videos).values(rows).onConflictDoNothing();
  }
  return rows.length;
}

const CRON_LOOKBACK_DAYS = 14;

export interface RefreshResult {
  channels: number;
  added: number;
  errors: string[];
  /** Channels that actually had new videos, e.g. [{ title, added }] */
  breakdown: { title: string; added: number }[];
}

export async function refreshAllChannels(db: Db): Promise<RefreshResult> {
  const active = await db
    .select()
    .from(channels)
    .where(eq(channels.isActive, true));
  const since = new Date(Date.now() - CRON_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  let added = 0;
  const errors: string[] = [];
  const breakdown: { title: string; added: number }[] = [];
  for (const channel of active) {
    try {
      const count = await ingestChannel(db, channel, since);
      added += count;
      if (count > 0) breakdown.push({ title: channel.title, added: count });
    } catch (err) {
      errors.push(`${channel.title}: ${(err as Error).message}`);
    }
  }
  return { channels: active.length, added, errors, breakdown };
}
