import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "./db";
import { buildCheatSheet } from "./gemini";
import {
  MAX_CHARS,
  MAX_LINES,
  collectLines,
  genreMatches,
  linesChars,
  linesHash,
  type LineSource,
} from "./cheatSheetLines";
import { looseKey } from "./looseMatch";
import { channels, cheatSheets, videoNotes, videos, type CheatSheet } from "./schema";

// Cheat sheets (FEAT-15), part 3: the server side. The lines are always
// collected here from the database, never taken from the browser, so a
// sheet only ever reflects what's really in your notes.

/** A problem with the request itself (shown as is, with a 400). */
export class CheatSheetError extends Error {}

const MAX_QUERY = 80;

/** Every saved answer and own note in the chosen genre, as line sources. */
async function loadSources(db: Db, genreKey: string): Promise<LineSource[]> {
  const [answerRows, noteRows] = await Promise.all([
    db
      .select({ videoId: videoNotes.videoId, text: videoNotes.answer, genreId: channels.genreId })
      .from(videoNotes)
      .innerJoin(videos, eq(videoNotes.videoId, videos.id))
      .innerJoin(channels, eq(videos.channelId, channels.id)),
    db
      .select({ videoId: videos.id, text: videos.personalNote, genreId: channels.genreId })
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      .where(isNotNull(videos.personalNote)),
  ]);
  return [
    ...answerRows.map((r) => ({ ...r, kind: "answer" as const })),
    ...noteRows.map((r) => ({ ...r, text: r.text ?? "", kind: "note" as const })),
  ]
    .filter((r) => genreMatches(genreKey, r.genreId))
    .map(({ videoId, text, kind }) => ({ videoId, text, kind }));
}

export async function listCheatSheets(db: Db): Promise<CheatSheet[]> {
  return db.select().from(cheatSheets).orderBy(desc(cheatSheets.updatedAt));
}

/**
 * Makes the cheat sheet for a search (and genre choice), or updates the one
 * that already exists for it. One Gemini call.
 */
export async function makeCheatSheet(db: Db, rawQuery: string, genreKey: string): Promise<CheatSheet> {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  const queryKey = looseKey(query);
  if (!queryKey) throw new CheatSheetError("Search for a topic first.");
  if (query.length > MAX_QUERY) throw new CheatSheetError("That search is too long for a cheat sheet.");
  if (!/^(all|none|\d+)$/.test(genreKey)) throw new CheatSheetError("That genre isn't valid.");

  const lines = collectLines(await loadSources(db, genreKey), query);
  if (lines.length === 0) {
    throw new CheatSheetError(`Nothing in your notes mentions "${query}".`);
  }
  if (lines.length > MAX_LINES || linesChars(lines) > MAX_CHARS) {
    throw new CheatSheetError(
      `"${query}" matches too much of your notebook for one cheat sheet. Pick a genre or a narrower search.`
    );
  }

  const { questions, model } = await buildCheatSheet(db, query, lines);
  const values = {
    query,
    questions,
    lineCount: lines.length,
    videoCount: new Set(lines.flatMap((l) => l.videoIds)).size,
    linesHash: linesHash(lines),
    model,
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select({ id: cheatSheets.id })
    .from(cheatSheets)
    .where(and(eq(cheatSheets.queryKey, queryKey), eq(cheatSheets.genreKey, genreKey)));
  if (existing) {
    const [row] = await db.update(cheatSheets).set(values).where(eq(cheatSheets.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(cheatSheets).values({ ...values, queryKey, genreKey }).returning();
  return row;
}

const MAX_HANDWRITTEN_TITLE = 80;

/**
 * The heading on a sheet's handwritten page (FEAT-16). Empty clears it, so
 * the page goes back to "<Topic> questions". Returns false if the sheet is gone.
 */
export async function setHandwrittenTitle(db: Db, id: number, raw: unknown): Promise<boolean> {
  if (raw != null && typeof raw !== "string") throw new CheatSheetError("The heading must be text.");
  const title = (raw ?? "").trim().replace(/\s+/g, " ");
  if (title.length > MAX_HANDWRITTEN_TITLE) throw new CheatSheetError("That heading is too long.");
  const rows = await db
    .update(cheatSheets)
    .set({ handwrittenTitle: title || null })
    .where(eq(cheatSheets.id, id))
    .returning({ id: cheatSheets.id });
  return rows.length > 0;
}

export async function deleteCheatSheet(db: Db, id: number): Promise<boolean> {
  const rows = await db.delete(cheatSheets).where(eq(cheatSheets.id, id)).returning({ id: cheatSheets.id });
  return rows.length > 0;
}
