import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import { channels, videoNotes, videos } from "./schema";

// Global search (the top bar's box): channels, videos, and your answers and
// notes, in one request. Personal scale (~100 channels, ~10k videos, a few
// hundred answers), so plain ILIKE plus the trigram similarity the feed
// already uses is fast enough — no search index or external service.

/** How many of each group come back; "All" shows the first few of each. */
const LIMIT = { channels: 8, videos: 10, answers: 10 };
/** Characters of context around a match in an answer or note. */
const BEFORE = 50;
const AFTER = 110;

interface SearchResults {
  query: string;
  /** True when the query started with "@": channels only. */
  channelsOnly: boolean;
  channels: {
    id: number;
    title: string;
    handle: string | null;
    thumbnail: string | null;
    videoCount: number;
  }[];
  videos: {
    id: number;
    title: string;
    thumbnail: string | null;
    durationSeconds: number;
    isShort: boolean;
    watched: boolean;
    publishedAt: Date;
    channelTitle: string;
  }[];
  /** Saved Ask answers and personal notes, newest first. */
  answers: {
    kind: "answer" | "note";
    /** Answer id, or the video id for a note. */
    id: number;
    videoId: number;
    videoTitle: string;
    /** The question asked (answers only). */
    prompt: string | null;
    /** The lines around the first match. */
    snippet: string;
    at: Date;
  }[];
  totals: { channels: number; videos: number; answers: number };
}

/** Escape % and _ so a search for "50%" means the characters, not a wildcard. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The text around the first match, flattened to one line. Markdown marks
 * (#, *, `) are dropped so the snippet reads as plain text.
 */
function snippetAround(text: string, term: string): string {
  const flat = text.replace(/[#*`>_]+/g, "").replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1) return flat.slice(0, BEFORE + AFTER) + (flat.length > BEFORE + AFTER ? "…" : "");
  const start = Math.max(0, at - BEFORE);
  const end = Math.min(flat.length, at + term.length + AFTER);
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
}

export async function searchEverything(db: Db, raw: string): Promise<SearchResults> {
  const channelsOnly = raw.trimStart().startsWith("@");
  const term = raw.trim().replace(/^@/, "").trim();
  const empty: SearchResults = {
    query: term,
    channelsOnly,
    channels: [],
    videos: [],
    answers: [],
    totals: { channels: 0, videos: 0, answers: 0 },
  };
  if (term.length < 2) return empty;

  const like = likePattern(term);
  const lower = term.toLowerCase();

  // Channels: name or @handle contains it, or the name is close (typos).
  const channelMatch = or(
    ilike(channels.title, like),
    ilike(channels.handle, like),
    sql`word_similarity(${lower}::text, lower(${channels.title})) > 0.4`
  );
  // Videos: the same fuzzy title match the feed's search box uses.
  const videoMatch = sql`(${videos.title} ILIKE ${like} OR word_similarity(${lower}::text, lower(${videos.title})) > 0.4)`;

  const channelQuery = db
    .select({
      id: channels.id,
      title: channels.title,
      handle: channels.handle,
      thumbnail: channels.thumbnail,
      videoCount: sql<number>`(SELECT count(*)::int FROM videos WHERE videos.channel_id = ${channels.id})`,
      // Exact containment beats a fuzzy match; then alphabetical.
      exact: sql<boolean>`(${channels.title} ILIKE ${like} OR coalesce(${channels.handle}, '') ILIKE ${like})`,
    })
    .from(channels)
    .where(channelMatch)
    .orderBy(
      sql`(${channels.title} ILIKE ${like} OR coalesce(${channels.handle}, '') ILIKE ${like}) DESC`,
      channels.title
    );

  if (channelsOnly) {
    const found = await channelQuery;
    return {
      ...empty,
      channels: found.slice(0, LIMIT.channels).map(stripExact),
      totals: { channels: found.length, videos: 0, answers: 0 },
    };
  }

  const answerMatch = or(ilike(videoNotes.prompt, like), ilike(videoNotes.answer, like));
  const noteMatch = and(isNotNull(videos.personalNote), ilike(videos.personalNote, like));

  // Everything at once: on Neon each query is a round trip, in parallel.
  const [channelRows, videoRows, [videoCount], answerRows, [answerCount], noteRows, [noteCount]] =
    await Promise.all([
      channelQuery,
      db
        .select({
          id: videos.id,
          title: videos.title,
          thumbnail: videos.thumbnail,
          durationSeconds: videos.durationSeconds,
          isShort: videos.isShort,
          watched: videos.watched,
          publishedAt: videos.publishedAt,
          channelTitle: channels.title,
        })
        .from(videos)
        .innerJoin(channels, eq(videos.channelId, channels.id))
        .where(videoMatch)
        // Titles that actually contain the words first, then the newest.
        .orderBy(sql`(${videos.title} ILIKE ${like}) DESC`, desc(videos.publishedAt))
        .limit(LIMIT.videos),
      db.select({ n: sql<number>`count(*)::int` }).from(videos).where(videoMatch),
      db
        .select({
          id: videoNotes.id,
          videoId: videoNotes.videoId,
          prompt: videoNotes.prompt,
          answer: videoNotes.answer,
          createdAt: videoNotes.createdAt,
          videoTitle: videos.title,
        })
        .from(videoNotes)
        .innerJoin(videos, eq(videoNotes.videoId, videos.id))
        .where(answerMatch)
        .orderBy(desc(videoNotes.createdAt))
        .limit(LIMIT.answers),
      db.select({ n: sql<number>`count(*)::int` }).from(videoNotes).where(answerMatch),
      db
        .select({
          videoId: videos.id,
          videoTitle: videos.title,
          note: videos.personalNote,
          at: videos.personalNoteAt,
        })
        .from(videos)
        .where(noteMatch)
        .orderBy(desc(videos.personalNoteAt))
        .limit(LIMIT.answers),
      db.select({ n: sql<number>`count(*)::int` }).from(videos).where(noteMatch),
    ]);

  const answers: SearchResults["answers"] = [
    ...answerRows.map((a) => ({
      kind: "answer" as const,
      id: a.id,
      videoId: a.videoId,
      videoTitle: a.videoTitle,
      prompt: a.prompt,
      // A question that matches is the snippet; otherwise the answer's line.
      snippet: a.answer.toLowerCase().includes(lower) ? snippetAround(a.answer, term) : snippetAround(a.prompt, term),
      at: a.createdAt,
    })),
    ...noteRows.map((n) => ({
      kind: "note" as const,
      id: n.videoId,
      videoId: n.videoId,
      videoTitle: n.videoTitle,
      prompt: null,
      snippet: snippetAround(n.note ?? "", term),
      at: n.at ?? new Date(0),
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, LIMIT.answers);

  return {
    query: term,
    channelsOnly: false,
    channels: channelRows.slice(0, LIMIT.channels).map(stripExact),
    videos: videoRows,
    answers,
    totals: {
      channels: channelRows.length,
      videos: Number(videoCount?.n ?? 0),
      answers: Number(answerCount?.n ?? 0) + Number(noteCount?.n ?? 0),
    },
  };
}

function stripExact<T extends { exact: boolean }>({ exact: _exact, ...rest }: T): Omit<T, "exact"> {
  void _exact;
  return rest;
}
