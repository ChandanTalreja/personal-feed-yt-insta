import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { deleteTrack, getTrack, renameTrack } from "@/lib/tracks";
import { trackErrorResponse } from "@/app/api/tracks/respond";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/** GET /api/tracks/[id] — the track and its videos, in order. */
export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  try {
    const id = parseId((await params).id);
    if (id == null) return badId();
    const db = await getDb();
    return NextResponse.json(await getTrack(db, id));
  } catch (err) {
    return trackErrorResponse(err);
  }
}

/** PATCH /api/tracks/[id] { name } — rename. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  try {
    const id = parseId((await params).id);
    if (id == null) return badId();
    const body = await req.json().catch(() => ({}));
    const db = await getDb();
    return NextResponse.json({ track: await renameTrack(db, id, body.name) });
  } catch (err) {
    return trackErrorResponse(err);
  }
}

/** DELETE /api/tracks/[id] — delete the track (its videos are untouched). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  try {
    const id = parseId((await params).id);
    if (id == null) return badId();
    const db = await getDb();
    await deleteTrack(db, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return trackErrorResponse(err);
  }
}
