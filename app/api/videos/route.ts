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
import { denyUnlessAuthed } from "@/lib/auth";
import { channels, videos } from "@/lib/schema";

const PAGE_SIZE = 24;
/** Ceiling for ids=1 — a track of 300+ videos is a search that's too broad. */
const MAX_BULK_IDS = 300;

export async function GET(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
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

  // Each filter is kept as its own piece, so the sidebar counts can drop
  // exactly one of them (see `facets` below).
  const kindC = [];
  if (kind === "videos") kindC.push(eq(videos.isShort, false));
  if (kind === "shorts") kindC.push(eq(videos.isShort, true));
  const viewC = [];
  if (watched === "unwatched") viewC.push(eq(videos.watched, false));
  if (watched === "watched") viewC.push(eq(videos.watched, true));
  // LATER behaves like the other tabs: it follows genre/channel/kind/search.
  const later = watched === "later";
  if (later) viewC.push(isNotNull(videos.laterAt));
  const genreC = genreId ? [eq(channels.genreId, Number(genreId))] : [];
  const channelC =
    channelIds.length > 0 ? [inArray(videos.channelId, channelIds)] : [];
  const searchC = [];
  // Fuzzy title search: exact/substring via ILIKE, plus pg_trgm trigram
  // word-similarity so small typos ("kubernets") still match. Just one
  // more AND — it narrows within whatever filters are already applied.
  if (search) {
    const like = `%${search}%`;
    const term = search.toLowerCase();
    searchC.push(
      sql`(${videos.title} ILIKE ${like} OR word_similarity(${term}::text, lower(${videos.title})) > 0.4)`
    );
  }

  // Length buckets: under 10 min / 10–30 min / 30 min and up. A duration of
  // 0 means "unknown", so it only shows under ANY.
  const lengthC = [];
  if (length === "short") {
    lengthC.push(gt(videos.durationSeconds, 0), lt(videos.durationSeconds, 600));
  } else if (length === "medium") {
    lengthC.push(gte(videos.durationSeconds, 600), lt(videos.durationSeconds, 1800));
  } else if (length === "long") {
    lengthC.push(gte(videos.durationSeconds, 1800));
  }

  const conditions = [
    ...kindC, ...viewC, ...genreC, ...channelC, ...searchC, ...lengthC,
  ];
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

  // Sidebar counts. Every number answers "what would I see if I clicked
  // this row, keeping everything else?" So the view counts drop only the
  // view filter, and the genre counts drop genre and channel (picking a
  // genre clears the channel choice). Only needed with the first page.
  const andAll = (parts: typeof conditions) =>
    parts.length ? and(...parts) : undefined;
  const facetQueries =
    page === 0
      ? ([
          db
            .select({
              unwatched: sql<number>`count(*) FILTER (WHERE ${videos.watched} = false)::int`,
              watched: sql<number>`count(*) FILTER (WHERE ${videos.watched} = true)::int`,
              later: sql<number>`count(*) FILTER (WHERE ${videos.laterAt} IS NOT NULL)::int`,
              all: sql<number>`count(*)::int`,
            })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .where(andAll([...kindC, ...genreC, ...channelC, ...searchC, ...lengthC])),
          db
            .select({ genreId: channels.genreId, n: count() })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .where(andAll([...kindC, ...viewC, ...searchC, ...lengthC]))
            .groupBy(channels.genreId),
        ] as const)
      : null;

  // The queries are independent, so they run in parallel — on Neon each is
  // an HTTP round trip, and parallel keeps the tab one trip slow.
  const [rows, laterByKind, totalsRow, facetRows] = await Promise.all([
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
    facetQueries ? Promise.all(facetQueries) : null,
  ]);
  const totals = {
    count: Number(totalsRow[0]?.n ?? 0),
    seconds: Number(totalsRow[0]?.seconds ?? 0),
  };

  const laterCounts = { videos: 0, shorts: 0 };
  for (const r of laterByKind) {
    laterCounts[r.isShort ? "shorts" : "videos"] = Number(r.n);
  }

  let facets = null;
  if (facetRows) {
    const [[views], genreRows] = facetRows;
    facets = {
      views: {
        unwatched: Number(views?.unwatched ?? 0),
        later: Number(views?.later ?? 0),
        watched: Number(views?.watched ?? 0),
        all: Number(views?.all ?? 0),
      },
      // { "3": 120, "none": 4 } — "none" = channels without a genre.
      genres: Object.fromEntries(
        genreRows.map((g) => [g.genreId ?? "none", Number(g.n)])
      ),
    };
  }

  const hasMore = rows.length > PAGE_SIZE;
  return NextResponse.json({
    videos: rows.slice(0, PAGE_SIZE),
    hasMore,
    page,
    laterCounts,
    totals,
    facets,
  });
}
