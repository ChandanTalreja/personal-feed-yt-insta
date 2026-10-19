import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { addVideos, removeVideo } from "@/lib/tracks";
import { trackErrorResponse } from "@/app/api/tracks/respond";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/** POST /api/tracks/[id]/videos { videoIds, order? } — append videos. */
export async function POST(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  try {
    const id = parseId((await params).id);
    if (id == null) return badId();
    const body = await req.json().catch(() => ({}));
    const db = await getDb();
    const result = await addVideos(
      db,
      id,
      body.videoIds,
      body.order === "oldest" ? "oldest" : "given"
    );
    return NextResponse.json(result);
  } catch (err) {
    return trackErrorResponse(err);
  }
}

/** DELETE /api/tracks/[id]/videos?videoId=N — take a video out of the track. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  try {
    const id = parseId((await params).id);
    if (id == null) return badId();
    const videoId = Number(req.nextUrl.searchParams.get("videoId"));
    if (!Number.isInteger(videoId) || videoId <= 0) {
      return NextResponse.json({ error: "Pick a video to add." }, { status: 400 });
    }
    const db = await getDb();
    await removeVideo(db, id, videoId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return trackErrorResponse(err);
  }
}
