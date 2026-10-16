import { NextRequest, NextResponse } from "next/server";
import { feedVideoColumns } from "@/lib/videoColumns";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
  sum,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { channels, videos } from "@/lib/schema";

const PAGE_SIZE = 24;
/** Ceiling for ids=1 — a track of 300+ videos is a search that's too broad. */
const MAX_BULK_IDS = 300;

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const kind = q.get("kind") ?? "videos"; // videos | shorts | all
  const watched = q.get("watched") ?? "all"; // unwatched | watched | all | later
  const genreId = q.get("genreId");
  const channelIds = (q.get("channelIds") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const page = Math.max(0, Number(q.get("page")) || 0);
  const search = (q.get("search") ?? "").trim();
  const length = q.get("length") ?? "any"; // any | short | medium | long

  const conditions = [];
  if (kind === "videos") conditions.push(eq(videos.isShort, false));
  if (kind === "shorts") conditions.push(eq(videos.isShort, true));
  if (watched === "unwatched") conditions.push(eq(videos.watched, false));
  if (watched === "watched") conditions.push(eq(videos.watched, true));
  // LATER behaves like the other tabs: it follows genre/channel/kind/search.
  const later = watched === "later";
  if (later) conditions.push(isNotNull(videos.laterAt));
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

  // Length buckets: under 10 min / 10–30 min / 30 min and up. A duration of
  // 0 means "unknown", so it only shows under ANY.
  if (length === "short") {
    conditions.push(gt(videos.durationSeconds, 0), lt(videos.durationSeconds, 600));
  } else if (length === "medium") {
    conditions.push(gte(videos.durationSeconds, 600), lt(videos.durationSeconds, 1800));
  } else if (length === "long") {
    conditions.push(gte(videos.durationSeconds, 1800));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const db = await getDb();

  // ids=1: every matching video id, oldest upload first (capped) — used by
  // "Add these N to a track", so bulk-adding runs through exactly the same
  // filters as the feed you're looking at.
  if (q.get("ids") === "1") {
    const idRows = await db
      .select({ id: videos.id })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(where)
      .orderBy(asc(videos.publishedAt))
      .limit(MAX_BULK_IDS);
    return NextResponse.json({ ids: idRows.map((r) => r.id) });
  }

  // The three queries are independent, so they run in parallel — on Neon
  // each is an HTTP round trip, and parallel keeps the tab one trip slow.
  const [rows, laterByKind, totalsRow] = await Promise.all([
    db
      .select(feedVideoColumns)
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(where)
      // LATER: newest saved first. Every other tab: newest uploaded first.
      .orderBy(later ? desc(videos.laterAt) : desc(videos.publishedAt))
      .limit(PAGE_SIZE + 1)
      .offset(page * PAGE_SIZE),
    // Everything saved, ignoring filters — the tab badge's total.
    db
      .select({ isShort: videos.isShort, n: count() })
      .from(videos)
      .where(isNotNull(videos.laterAt))
      .groupBy(videos.isShort),
    // Count and total length of everything the current filters match — not
    // just the loaded page. On LATER, the count is also how many saved
    // videos are visible, which drives the "N more saved" hint.
    db
      .select({ n: count(), seconds: sum(videos.durationSeconds) })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(where),
  ]);
  const totals = {
    count: Number(totalsRow[0]?.n ?? 0),
    seconds: Number(totalsRow[0]?.seconds ?? 0),
  };

  const laterCounts = { videos: 0, shorts: 0 };
  for (const r of laterByKind) {
    laterCounts[r.isShort ? "shorts" : "videos"] = Number(r.n);
  }

  const hasMore = rows.length > PAGE_SIZE;
  return NextResponse.json({
    videos: rows.slice(0, PAGE_SIZE),
    hasMore,
    page,
    laterCounts,
    totals,
  });
}
