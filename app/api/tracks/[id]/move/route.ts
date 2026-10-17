import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { moveVideo } from "@/lib/tracks";
import { trackErrorResponse } from "@/app/api/tracks/respond";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/** POST /api/tracks/[id]/move { videoId, direction: "up" | "down" }. */
export async function POST(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  try {
    const id = parseId((await params).id);
    if (id == null) return badId();
    const body = await req.json().catch(() => ({}));
    const db = await getDb();
    await moveVideo(db, id, Number(body.videoId), body.direction);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return trackErrorResponse(err);
  }
}
