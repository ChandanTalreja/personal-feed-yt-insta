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
import type { Db } from "./db";
import { channels, videos } from "./schema";
import { feedVideoColumns } from "./videoColumns";

// The Feed's and Podcasts' video list: one function behind both
// `GET /api/videos` and the pages that send their first screen with the
// HTML (audit B1), so the two can never disagree.

const PAGE_SIZE = 24;
/** Ceiling for ids=1 — a track of 300+ videos is a search that's too broad. */
const MAX_BULK_IDS = 300;
/** Episodes shown under "Continue listening". */
const CONTINUE_LIMIT = 12;

export interface FeedQuery {
  /** Feed and Podcasts are separate pages over the same videos (FEAT-14). */
  section: "feed" | "podcasts";
  kind: string; // videos | shorts | all
  watched: string; // unwatched | watched | all | later
  genreId: number | null;
  channelIds: number[];
  page: number;
  search: string;
  /** Feed: any | short | medium | long. Podcasts: under1h | 1to2h | over2h. */
  length: string;
  /** Every matching id instead of a page ("Add these N to a track"). */
  ids: boolean;
  /** Podcasts' "Continue listening" list instead of a page. */
  continueListening: boolean;
}

/** The query string of `GET /api/videos`, as a FeedQuery. */
export function parseFeedQuery(q: URLSearchParams): FeedQuery {
  const genreId = q.get("genreId");
  return {
    section: q.get("section") === "podcasts" ? "podcasts" : "feed",
    kind: q.get("kind") ?? "videos",
    watched: q.get("watched") ?? "all",
    genreId: genreId ? Number(genreId) : null,
    channelIds: (q.get("channelIds") ?? "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
    page: Math.max(0, Number(q.get("page")) || 0),
    search: (q.get("search") ?? "").trim(),
    length: q.get("length") ?? "any",
    ids: q.get("ids") === "1",
    continueListening: q.get("continue") === "1",
  };
}

export async function listFeedVideos(db: Db, query: FeedQuery) {
  const { kind, watched, genreId, channelIds, page, search, length } = query;
  const sectionC = eq(channels.section, query.section);

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
  const genreC = genreId != null ? [eq(channels.genreId, genreId)] : [];
  const channelC =
    channelIds.length > 0 ? [inArray(videos.channelId, channelIds)] : [];
  const searchC = [];
  // While searching, titles that really contain the words come first and
  // fuzzy look-alikes after ("redis" also matches "Redux" at 0.5), each
  // group in the view's usual order — the same rule as global search.
  const searchOrder = [];
  // Fuzzy title search: exact/substring via ILIKE, plus pg_trgm trigram
  // word-similarity so small typos ("kubernets") still match. Just one
  // more AND — it narrows within whatever filters are already applied.
  if (search) {
    const like = `%${search}%`;
    const term = search.toLowerCase();
    searchC.push(
      sql`(${videos.title} ILIKE ${like} OR word_similarity(${term}::text, lower(${videos.title})) > 0.4)`
    );
    searchOrder.push(sql`(${videos.title} ILIKE ${like}) DESC`);
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
  } else if (length === "under1h") {
    // Podcasts (FEAT-14): nearly every episode is over 30 min, so they're
    // bucketed by the hour instead: how much time have you got?
    lengthC.push(gt(videos.durationSeconds, 0), lt(videos.durationSeconds, 3600));
  } else if (length === "1to2h") {
    lengthC.push(gte(videos.durationSeconds, 3600), lt(videos.durationSeconds, 7200));
  } else if (length === "over2h") {
    lengthC.push(gte(videos.durationSeconds, 7200));
  }

  const conditions = [
    sectionC, ...kindC, ...viewC, ...genreC, ...channelC, ...searchC, ...lengthC,
  ];
  const where = conditions.length ? and(...conditions) : undefined;

  // continue=1 (Podcasts): episodes you started and didn't finish, the most
  // recently played first, for "Continue listening".
  if (query.continueListening) {
    const rows = await db
      .select(feedVideoColumns)
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(
        and(
          sectionC,
          eq(videos.watched, false),
          eq(videos.isShort, false),
          isNotNull(videos.lastPlayedAt),
          gt(videos.resumeSeconds, 60)
        )
      )
      .orderBy(desc(videos.lastPlayedAt))
      .limit(CONTINUE_LIMIT);
    return { videos: rows };
  }

  // ids=1: every matching video id, oldest upload first (capped) — used by
  // "Add these N to a track", so bulk-adding runs through exactly the same
  // filters as the feed you're looking at.
  if (query.ids) {
    const idRows = await db
      .select({ id: videos.id })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(where)
      .orderBy(asc(videos.publishedAt))
      .limit(MAX_BULK_IDS);
    return { ids: idRows.map((r) => r.id) };
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
            .where(andAll([sectionC, ...kindC, ...genreC, ...channelC, ...searchC, ...lengthC])),
          db
            .select({ genreId: channels.genreId, n: count() })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .where(andAll([sectionC, ...kindC, ...viewC, ...searchC, ...lengthC]))
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
      // (Searching: exact title matches ahead of near matches.)
      .orderBy(...searchOrder, later ? desc(videos.laterAt) : desc(videos.publishedAt))
      .limit(PAGE_SIZE + 1)
      .offset(page * PAGE_SIZE),
    // Everything saved on this page, ignoring filters — the tab badge's total.
    db
      .select({ isShort: videos.isShort, n: count() })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(and(sectionC, isNotNull(videos.laterAt)))
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
  return {
    videos: rows.slice(0, PAGE_SIZE),
    hasMore,
    page,
    laterCounts,
    totals,
    facets,
  };
}
