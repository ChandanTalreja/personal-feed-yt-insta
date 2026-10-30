import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { StickyNoteError, deleteStickyNote, updateStickyNote } from "@/lib/stickyNotes";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/** PATCH { body?, color?, handwritten?, pinned? } */
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const change = await req.json().catch(() => ({}));
  try {
    const db = await getDb();
    const note = await updateStickyNote(db, id, change);
    if (!note) return NextResponse.json({ error: "That note is gone." }, { status: 404 });
    return NextResponse.json({ note });
  } catch (err) {
    if (err instanceof StickyNoteError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const db = await getDb();
  if (!(await deleteStickyNote(db, id))) {
    return NextResponse.json({ error: "That note is already gone." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
