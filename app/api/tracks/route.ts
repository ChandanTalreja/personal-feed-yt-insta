import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { addVideos, createTrack, listTracks } from "@/lib/tracks";
import { trackErrorResponse } from "@/app/api/tracks/respond";

/** GET /api/tracks[?videoId=N] — all tracks with progress stats; with a
 *  videoId, each also says whether it contains that video (card menu). */
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const raw = req.nextUrl.searchParams.get("videoId");
    const videoId = raw ? Number(raw) : undefined;
    const db = await getDb();
    return NextResponse.json({ tracks: await listTracks(db, videoId) });
  } catch (err) {
    return trackErrorResponse(err);
  }
}

/** POST /api/tracks { name, videoIds?, order? } — create a track, and
 *  optionally fill it in the same request (card menu / bulk add). */
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const db = await getDb();
    const track = await createTrack(db, body.name);
    const result = body.videoIds
      ? await addVideos(db, track.id, body.videoIds, body.order === "oldest" ? "oldest" : "given")
      : { added: 0, skipped: 0 };
    return NextResponse.json({ track, ...result });
  } catch (err) {
    return trackErrorResponse(err);
  }
}
