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

export async function refreshAllChannels(
  db: Db
): Promise<{ channels: number; added: number; errors: string[] }> {
  const active = await db
    .select()
    .from(channels)
    .where(eq(channels.isActive, true));
  const since = new Date(Date.now() - CRON_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  let added = 0;
  const errors: string[] = [];
  for (const channel of active) {
    try {
      added += await ingestChannel(db, channel, since);
    } catch (err) {
      errors.push(`${channel.title}: ${(err as Error).message}`);
    }
  }
  return { channels: active.length, added, errors };
}
