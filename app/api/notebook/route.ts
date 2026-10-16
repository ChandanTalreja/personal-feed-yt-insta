import { NextResponse } from "next/server";
import { desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { channels, videoNotes, videos } from "@/lib/schema";
import { feedVideoColumns } from "@/lib/videoColumns";

/**
 * Everything the Notebook page shows, in one request: every saved Ask
 * answer, plus the videos they belong to (each video once) — including
 * videos that only have a personal note. The page
 * filters, groups and searches in the browser — at personal scale (dozens
 * to a few hundred answers) that makes every filter instant, with no extra
 * round trips. Read-only: no Gemini calls, no quota.
 */
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();

  const notedVideoIds = db
    .selectDistinct({ id: videoNotes.videoId })
    .from(videoNotes);

  const [answers, videoRows] = await Promise.all([
    db
      .select({
        id: videoNotes.id,
        videoId: videoNotes.videoId,
        prompt: videoNotes.prompt,
        answer: videoNotes.answer,
        createdAt: videoNotes.createdAt,
      })
      .from(videoNotes)
      .orderBy(desc(videoNotes.createdAt)),
    db
      .select(feedVideoColumns)
      .from(videos)
      .innerJoin(channels, eq(videos.channelId, channels.id))
      // Videos with saved answers, or with a personal note (or both).
      .where(
        or(inArray(videos.id, notedVideoIds), isNotNull(videos.personalNote))
      ),
  ]);

  return NextResponse.json({ answers, videos: videoRows });
}
