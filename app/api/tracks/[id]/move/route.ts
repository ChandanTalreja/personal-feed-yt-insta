import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { moveVideo } from "@/lib/tracks";
import { trackErrorResponse } from "@/app/api/tracks/respond";

type Params = { params: Promise<{ id: string }> };

/** POST /api/tracks/[id]/move { videoId, direction: "up" | "down" }. */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = await getDb();
    await moveVideo(db, Number(id), Number(body.videoId), body.direction);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return trackErrorResponse(err);
  }
}
