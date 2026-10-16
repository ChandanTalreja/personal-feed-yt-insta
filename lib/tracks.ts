import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { Db } from "./db";
import { channels, trackVideos, tracks, videos } from "./schema";
import { feedVideoColumns } from "./videoColumns";
import { coveredRatio } from "./progress";

// Learning tracks: named, ordered lists of videos to work through.
// The rules live here; the route handlers only translate HTTP.

const MAX_NAME_CHARS = 60;

export class TrackError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface TrackSummary {
  id: number;
  name: string;
  createdAt: Date;
  count: number;
  watchedCount: number;
  totalSeconds: number;
  /** Time still to watch: unwatched videos minus what's already played. */
  remainingSeconds: number;
  /** What CONTINUE opens: the first unwatched video in track order. */
  nextVideoId: number | null;
  /** Only when asked about a specific video: is it in this track? */
  contains?: boolean;
}

function cleanName(raw: unknown): string {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new TrackError("Give the track a name.", 400);
  if (name.length > MAX_NAME_CHARS) {
    throw new TrackError(
      `Track names are limited to ${MAX_NAME_CHARS} characters.`,
      400
    );
  }
  return name;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return (
    e?.code === "23505" ||
    e?.cause?.code === "23505" ||
    /unique|duplicate key/i.test(String(e?.message ?? ""))
  );
}

/** All tracks with their progress stats, newest first. */
export async function listTracks(
  db: Db,
  forVideoId?: number
): Promise<TrackSummary[]> {
  const [trackRows, items] = await Promise.all([
    db.select().from(tracks).orderBy(desc(tracks.createdAt)),
    db
      .select({
        trackId: trackVideos.trackId,
        videoId: trackVideos.videoId,
        durationSeconds: videos.durationSeconds,
        watched: videos.watched,
        watchProgress: videos.watchProgress,
      })
      .from(trackVideos)
      .innerJoin(videos, eq(trackVideos.videoId, videos.id))
      .orderBy(asc(trackVideos.position)),
  ]);

  return trackRows.map((t) => {
    const mine = items.filter((i) => i.trackId === t.id);
    let remaining = 0;
    for (const v of mine) {
      if (!v.watched) {
        remaining +=
          v.durationSeconds *
          (1 - coveredRatio(v.watchProgress, v.durationSeconds));
      }
    }
    const summary: TrackSummary = {
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      count: mine.length,
      watchedCount: mine.filter((v) => v.watched).length,
      totalSeconds: mine.reduce((s, v) => s + v.durationSeconds, 0),
      remainingSeconds: Math.round(remaining),
      nextVideoId: mine.find((v) => !v.watched)?.videoId ?? null,
    };
    if (forVideoId != null) {
      summary.contains = mine.some((v) => v.videoId === forVideoId);
    }
    return summary;
  });
}

/** One track with its videos in order (FeedVideo shape + position). */
export async function getTrack(db: Db, trackId: number) {
  const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId));
  if (!track) throw new TrackError("Track not found.", 404);
  const items = await db
    .select({ ...feedVideoColumns, position: trackVideos.position })
    .from(trackVideos)
    .innerJoin(videos, eq(trackVideos.videoId, videos.id))
    .innerJoin(channels, eq(videos.channelId, channels.id))
    .where(eq(trackVideos.trackId, trackId))
    .orderBy(asc(trackVideos.position));
  return { track, videos: items };
}

export async function createTrack(db: Db, rawName: unknown) {
  const name = cleanName(rawName);
  try {
    const [track] = await db.insert(tracks).values({ name }).returning();
    return track;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new TrackError(`You already have a track called "${name}".`, 409);
    }
    throw err;
  }
}

export async function renameTrack(db: Db, trackId: number, rawName: unknown) {
  const name = cleanName(rawName);
  try {
    const [track] = await db
      .update(tracks)
      .set({ name })
      .where(eq(tracks.id, trackId))
      .returning();
    if (!track) throw new TrackError("Track not found.", 404);
    return track;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new TrackError(`You already have a track called "${name}".`, 409);
    }
    throw err;
  }
}

export async function deleteTrack(db: Db, trackId: number) {
  // track_videos rows go with it (ON DELETE CASCADE); videos are untouched.
  await db.delete(tracks).where(eq(tracks.id, trackId));
}

/**
 * Append videos to the end of a track. `order: "oldest"` sorts them by
 * upload date first (series are usually meant to be watched that way);
 * "given" keeps the caller's order. Videos already in the track — or that
 * don't exist — are skipped, so adding is safe to repeat.
 */
export async function addVideos(
  db: Db,
  trackId: number,
  rawIds: unknown,
  order: "oldest" | "given" = "given"
): Promise<{ added: number; skipped: number }> {
  if (!Array.isArray(rawIds)) {
    throw new TrackError("videoIds must be a list.", 400);
  }
  const requested = [
    ...new Set(
      rawIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    ),
  ];
  if (requested.length === 0) return { added: 0, skipped: rawIds.length };

  const [track] = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.id, trackId));
  if (!track) throw new TrackError("Track not found.", 404);

  const [found, existing, [{ top }]] = await Promise.all([
    db
      .select({ id: videos.id, publishedAt: videos.publishedAt })
      .from(videos)
      .where(inArray(videos.id, requested)),
    db
      .select({ videoId: trackVideos.videoId })
      .from(trackVideos)
      .where(
        and(
          eq(trackVideos.trackId, trackId),
          inArray(trackVideos.videoId, requested)
        )
      ),
    db
      .select({ top: max(trackVideos.position) })
      .from(trackVideos)
      .where(eq(trackVideos.trackId, trackId)),
  ]);

  const already = new Set(existing.map((e) => e.videoId));
  const publishedAt = new Map(found.map((f) => [f.id, f.publishedAt]));
  let toAdd = requested.filter((id) => publishedAt.has(id) && !already.has(id));
  if (order === "oldest") {
    toAdd = toAdd.sort(
      (a, b) => publishedAt.get(a)!.getTime() - publishedAt.get(b)!.getTime()
    );
  }

  if (toAdd.length > 0) {
    const start = (top ?? 0) + 1;
    await db
      .insert(trackVideos)
      .values(toAdd.map((videoId, i) => ({ trackId, videoId, position: start + i })))
      .onConflictDoNothing();
  }
  return { added: toAdd.length, skipped: rawIds.length - toAdd.length };
}

export async function removeVideo(db: Db, trackId: number, videoId: number) {
  // Gaps in `position` are harmless — only the relative order matters.
  await db
    .delete(trackVideos)
    .where(and(eq(trackVideos.trackId, trackId), eq(trackVideos.videoId, videoId)));
}

/** Swap a video with its neighbour above or below — one atomic statement. */
export async function moveVideo(
  db: Db,
  trackId: number,
  videoId: number,
  direction: unknown
) {
  if (direction !== "up" && direction !== "down") {
    throw new TrackError('direction must be "up" or "down".', 400);
  }
  const rows = await db
    .select({ videoId: trackVideos.videoId, position: trackVideos.position })
    .from(trackVideos)
    .where(eq(trackVideos.trackId, trackId))
    .orderBy(asc(trackVideos.position));
  const i = rows.findIndex((r) => r.videoId === videoId);
  if (i === -1) throw new TrackError("That video isn't in this track.", 404);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return; // already at the edge
  const a = rows[i];
  const b = rows[j];
  // ::int casts: bound parameters arrive untyped, and a CASE of untyped
  // values would otherwise resolve to text for an integer column.
  await db
    .update(trackVideos)
    .set({
      position: sql`CASE WHEN ${trackVideos.videoId} = ${a.videoId}::int THEN ${b.position}::int ELSE ${a.position}::int END`,
    })
    .where(
      and(
        eq(trackVideos.trackId, trackId),
        inArray(trackVideos.videoId, [a.videoId, b.videoId])
      )
    );
}
