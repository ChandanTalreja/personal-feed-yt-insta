import { desc, eq, max, sql } from "drizzle-orm";
import type { Db } from "./db";
import { channels, genres, videos } from "./schema";

/**
 * Every channel with its genre and per-kind video counts: the Channels page
 * and the feed sidebar. Shared by `GET /api/channels` and the pages that
 * send their first screen with the HTML (audit B1).
 */
export async function listChannels(db: Db) {
  // The channel list and the per-channel stats don't depend on each other,
  // so both queries go out at once — on Neon each is its own HTTP round trip.
  const [rows, stats] = await Promise.all([
    db
      .select({
        channel: channels,
        genre: genres,
      })
      .from(channels)
      .leftJoin(genres, eq(channels.genreId, genres.id))
      .orderBy(desc(channels.addedAt)),
    // Per channel, in one grouped pass over its videos: how many of each
    // kind are stored (the feed sidebar's archive-size counts, deliberately
    // independent of watched state), and when it last uploaded — the
    // Channels page's "last upload" and "quiet for months" status. Nothing
    // new is stored; it's all derived from the videos already ingested.
    db
      .select({
        channelId: videos.channelId,
        videoCount: sql<number>`count(*) FILTER (WHERE ${videos.isShort} = false)::int`,
        shortCount: sql<number>`count(*) FILTER (WHERE ${videos.isShort} = true)::int`,
        lastUploadAt: max(videos.publishedAt),
      })
      .from(videos)
      .groupBy(videos.channelId),
  ]);
  const byChannel = new Map(stats.map((s) => [s.channelId, s]));

  return rows.map((row) => {
    const s = byChannel.get(row.channel.id);
    return {
      ...row,
      videoCount: Number(s?.videoCount ?? 0),
      shortCount: Number(s?.shortCount ?? 0),
      lastUploadAt: s?.lastUploadAt ?? null,
    };
  });
}
