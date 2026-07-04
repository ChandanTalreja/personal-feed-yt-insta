import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { videoNotes, videos } from "@/lib/schema";
import { answerAboutVideo } from "@/lib/gemini";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const notes = await db
    .select()
    .from(videoNotes)
    .where(eq(videoNotes.videoId, Number(id)))
    .orderBy(desc(videoNotes.createdAt));
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Ask something first." }, { status: 400 });
  }

  const db = await getDb();
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, Number(id)));
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // Same question asked before → return the saved answer, no Gemini call.
  const [existing] = await db
    .select()
    .from(videoNotes)
    .where(
      sql`${videoNotes.videoId} = ${video.id} AND lower(${videoNotes.prompt}) = lower(${prompt})`
    );
  if (existing) {
    return NextResponse.json({ note: existing, cached: true });
  }

  try {
    const result = await answerAboutVideo(db, video, prompt);
    const [note] = await db
      .insert(videoNotes)
      .values({
        videoId: video.id,
        prompt,
        answer: result.answer,
        model: result.model,
        source: result.source,
      })
      .returning();
    return NextResponse.json({ note, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
