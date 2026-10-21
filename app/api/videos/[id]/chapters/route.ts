import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { badId, parseId } from "@/lib/http";
import { videos } from "@/lib/schema";
import { fetchVideoChapters } from "@/lib/youtube";

type Params = { params: Promise<{ id: string }> };

/**
 * A video's chapters (FEAT-14). New videos have them from the sync, read
 * from the description at no cost. A video saved before that is looked up
 * once (1 YouTube quota unit) and the answer stored, even when it's "none",
 * so it's never asked again.
 */
export async function GET(_req: Request, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const db = await getDb();
  const [video] = await db
    .select({ ytVideoId: videos.ytVideoId, chapters: videos.chapters, source: videos.chaptersSource })
    .from(videos)
    .where(eq(videos.id, id));
  if (!video) {
    return NextResponse.json({ error: "That video isn't in your library anymore." }, { status: 404 });
  }
  if (video.chapters != null) {
    return NextResponse.json({ chapters: video.chapters, source: video.source });
  }
  try {
    const chapters = (await fetchVideoChapters(video.ytVideoId)) ?? [];
    const source = chapters.length ? "youtube" : null;
    await db.update(videos).set({ chapters, chaptersSource: source }).where(eq(videos.id, id));
    return NextResponse.json({ chapters, source });
  } catch (err) {
    console.error(`chapters lookup failed for ${video.ytVideoId}: ${(err as Error).message}`);
    return NextResponse.json({ error: "Couldn't check YouTube for chapters right now. Please try again." }, { status: 502 });
  }
}
