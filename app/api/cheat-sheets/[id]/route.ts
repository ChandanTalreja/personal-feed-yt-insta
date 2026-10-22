import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { CheatSheetError, deleteCheatSheet, setHandwrittenTitle } from "@/lib/cheatSheets";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/** PATCH { handwrittenTitle }: the heading on the sheet's handwritten page (FEAT-16). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const body = await req.json().catch(() => ({}));
  try {
    const db = await getDb();
    if (!(await setHandwrittenTitle(db, id, body.handwrittenTitle))) {
      return NextResponse.json({ error: "That cheat sheet is gone." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CheatSheetError) {
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
  if (!(await deleteCheatSheet(db, id))) {
    return NextResponse.json({ error: "That cheat sheet is already gone." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
