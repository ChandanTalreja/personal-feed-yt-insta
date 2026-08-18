import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { channels, videos } from "@/lib/schema";

const PAGE_SIZE = 24;

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const kind = q.get("kind") ?? "videos"; // videos | shorts | all
  const watched = q.get("watched") ?? "all"; // unwatched | watched | all
  const genreId = q.get("genreId");
  const channelIds = (q.get("channelIds") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const page = Math.max(0, Number(q.get("page")) || 0);
  const search = (q.get("search") ?? "").trim();

  const conditions = [];
  if (kind === "videos") conditions.push(eq(videos.isShort, false));
  if (kind === "shorts") conditions.push(eq(videos.isShort, true));
  if (watched === "unwatched") conditions.push(eq(videos.watched, false));
  if (watched === "watched") conditions.push(eq(videos.watched, true));
  if (genreId) conditions.push(eq(channels.genreId, Number(genreId)));
  if (channelIds.length > 0) {
    conditions.push(inArray(videos.channelId, channelIds));
  }
  // Fuzzy title search: exact/substring via ILIKE, plus pg_trgm trigram
  // word-similarity so small typos ("kubernets") still match. Just one
  // more AND — it narrows within whatever filters are already applied.
  if (search) {
    const like = `%${search}%`;
    const term = search.toLowerCase();
    conditions.push(
      sql`(${videos.title} ILIKE ${like} OR word_similarity(${term}::text, lower(${videos.title})) > 0.4)`
    );
  }

  const db = await getDb();
  const rows = await db
    .select({
      id: videos.id,
      ytVideoId: videos.ytVideoId,
      title: videos.title,
      thumbnail: videos.thumbnail,
      durationSeconds: videos.durationSeconds,
      isShort: videos.isShort,
      isLive: videos.isLive,
      publishedAt: videos.publishedAt,
      watched: videos.watched,
      summary: videos.summary,
      channelTitle: channels.title,
      channelThumbnail: channels.thumbnail,
      genreId: channels.genreId,
    })
    .from(videos)
    .innerJoin(channels, eq(videos.channelId, channels.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(videos.publishedAt))
    .limit(PAGE_SIZE + 1)
    .offset(page * PAGE_SIZE);

  const hasMore = rows.length > PAGE_SIZE;
  return NextResponse.json({
    videos: rows.slice(0, PAGE_SIZE),
    hasMore,
    page,
  });
}
