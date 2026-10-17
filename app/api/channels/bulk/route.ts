import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { channels } from "@/lib/schema";

/** More than any real channel list; stops a malformed request doing damage. */
const MAX_IDS = 500;

type Action = "move" | "pause" | "resume" | "delete";

/**
 * POST /api/channels/bulk — one change applied to many channels at once:
 *   { ids: number[], action: "move", genreId: number | null }
 *   { ids: number[], action: "pause" | "resume" | "delete" }
 *
 * Each is a single UPDATE or DELETE … WHERE id IN (…), so ticking 20
 * channels costs one request and one database round trip, not 20.
 * (Backfill isn't here: it calls YouTube, which can take seconds per channel,
 * and Netlify stops a request after 10 s — the page runs those one by one.)
 *
 * Deleting a channel deletes its videos too (and with them their saved
 * answers, notes and track places), via ON DELETE CASCADE in the schema.
 */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids)
    ? [...new Set<number>(body.ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const action = body.action as Action;
  if (ids.length === 0 || ids.length > MAX_IDS) {
    return NextResponse.json({ error: "Pick between 1 and 500 channels." }, { status: 400 });
  }

  const db = await getDb();
  const where = inArray(channels.id, ids);
  let changed: { id: number }[];

  if (action === "move") {
    const genreId = body.genreId == null ? null : Number(body.genreId);
    if (genreId !== null && !Number.isInteger(genreId)) {
      return NextResponse.json({ error: "Unknown genre." }, { status: 400 });
    }
    changed = await db.update(channels).set({ genreId }).where(where).returning({ id: channels.id });
  } else if (action === "pause" || action === "resume") {
    changed = await db
      .update(channels)
      .set({ isActive: action === "resume" })
      .where(where)
      .returning({ id: channels.id });
  } else if (action === "delete") {
    changed = await db.delete(channels).where(where).returning({ id: channels.id });
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json({ changed: changed.length });
}
