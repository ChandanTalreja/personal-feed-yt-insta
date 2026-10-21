import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { deleteCheatSheet } from "@/lib/cheatSheets";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

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
