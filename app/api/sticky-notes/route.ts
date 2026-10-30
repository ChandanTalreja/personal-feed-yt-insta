import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { createStickyNote, listStickyNotes } from "@/lib/stickyNotes";

/** GET: every sticky note, pinned first (FEAT-17). */
export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const db = await getDb();
  return NextResponse.json({ notes: await listStickyNotes(db) });
}

/** POST { color }: a new, empty note. */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  return NextResponse.json({ note: await createStickyNote(db, body.color) });
}
