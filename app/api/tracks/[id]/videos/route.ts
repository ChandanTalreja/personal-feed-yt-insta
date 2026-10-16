import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { addVideos, removeVideo } from "@/lib/tracks";
import { trackErrorResponse } from "@/app/api/tracks/respond";

type Params = { params: Promise<{ id: string }> };

/** POST /api/tracks/[id]/videos { videoIds, order? } — append videos. */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = await getDb();
    const result = await addVideos(
      db,
      Number(id),
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
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const videoId = Number(req.nextUrl.searchParams.get("videoId"));
    if (!Number.isInteger(videoId) || videoId <= 0) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }
    const db = await getDb();
    await removeVideo(db, Number(id), videoId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return trackErrorResponse(err);
  }
}
