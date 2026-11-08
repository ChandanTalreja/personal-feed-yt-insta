import { asc, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./db";
import { isStickyColor } from "./stickyColors";
import { stickyNotes, type StickyNote } from "./schema";

// Sticky notes (FEAT-17), the server side: notes that belong to no video and
// stay out of the Notebook and ⌘K. Small and plain: no Gemini, no links.

/** A problem with the request itself (shown as is, with a 400). */
export class StickyNoteError extends Error {}

const MAX_BODY = 5000;

/** Pinned first; otherwise newest first, so a note doesn't jump while you type in it. */
export async function listStickyNotes(db: Db): Promise<StickyNote[]> {
  return db
    .select()
    .from(stickyNotes)
    .orderBy(desc(stickyNotes.pinned), desc(stickyNotes.createdAt), asc(stickyNotes.id));
}

/** How many there are: the Feed sidebar's count, sent inside the page. */
export async function countStickyNotes(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(stickyNotes);
  return row?.n ?? 0;
}

export async function createStickyNote(db: Db, color: unknown): Promise<StickyNote> {
  const [row] = await db
    .insert(stickyNotes)
    .values({ color: isStickyColor(color) ? color : "yellow" })
    .returning();
  return row;
}

/** Changes any of body, color, handwritten and pinned. Null when the note is gone. */
export async function updateStickyNote(
  db: Db,
  id: number,
  change: Record<string, unknown>
): Promise<StickyNote | null> {
  const set: Partial<Pick<StickyNote, "body" | "color" | "handwritten" | "pinned">> = {};
  if ("body" in change) {
    if (typeof change.body !== "string") throw new StickyNoteError("A note is text.");
    if (change.body.length > MAX_BODY) throw new StickyNoteError("That's too long for a sticky note.");
    set.body = change.body;
  }
  if ("color" in change) {
    if (!isStickyColor(change.color)) throw new StickyNoteError("That colour isn't one of the six.");
    set.color = change.color;
  }
  for (const key of ["handwritten", "pinned"] as const) {
    if (key in change) {
      if (typeof change[key] !== "boolean") throw new StickyNoteError(`"${key}" must be true or false.`);
      set[key] = change[key];
    }
  }
  if (Object.keys(set).length === 0) throw new StickyNoteError("Nothing to change.");
  const [row] = await db
    .update(stickyNotes)
    .set({ ...set, updatedAt: sql`now()` })
    .where(eq(stickyNotes.id, id))
    .returning();
  return row ?? null;
}

export async function deleteStickyNote(db: Db, id: number): Promise<boolean> {
  const rows = await db.delete(stickyNotes).where(eq(stickyNotes.id, id)).returning({ id: stickyNotes.id });
  return rows.length > 0;
}
