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
        // Picked ones (FEAT-22), so the sidebar in the Picked view lists only
        // the channels you picked from (FIX-20).
        pickedVideoCount: sql<number>`count(*) FILTER (WHERE ${videos.isShort} = false AND ${videos.pickedAt} IS NOT NULL)::int`,
        pickedShortCount: sql<number>`count(*) FILTER (WHERE ${videos.isShort} = true AND ${videos.pickedAt} IS NOT NULL)::int`,
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
      pickedVideoCount: Number(s?.pickedVideoCount ?? 0),
      pickedShortCount: Number(s?.pickedShortCount ?? 0),
      lastUploadAt: s?.lastUploadAt ?? null,
    };
  });
}

/** A channel already in TUBEBOX: added videos keep ITS genre and home. */
export interface KnownChannel {
  title: string;
  genreName: string | null;
  section: "feed" | "podcasts";
}

/**
 * Is this YouTube channel already here? If so, videos added from it go
 * under its own genre and Feed/Podcasts, not the add bar's (FIX-19), so the
 * add bar and the picker can say where they'll really go. Null when new.
 */
export async function findKnownChannel(db: Db, ytChannelId: string | null | undefined): Promise<KnownChannel | null> {
  if (!ytChannelId) return null;
  const [row] = await db
    .select({ title: channels.title, genreName: genres.name, section: channels.section })
    .from(channels)
    .leftJoin(genres, eq(channels.genreId, genres.id))
    .where(eq(channels.ytChannelId, ytChannelId));
  if (!row) return null;
  return { title: row.title, genreName: row.genreName ?? null, section: row.section === "podcasts" ? "podcasts" : "feed" };
}
