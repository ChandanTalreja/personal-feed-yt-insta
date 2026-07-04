import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { videos } from "@/lib/schema";
import { summarizeVideo } from "@/lib/gemini";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, Number(id)));
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  if (video.summary) {
    return NextResponse.json({ summary: video.summary, cached: true });
  }
  try {
    const result = await summarizeVideo(db, video);
    await db
      .update(videos)
      .set({ summary: result.answer })
      .where(eq(videos.id, video.id));
    return NextResponse.json({
      summary: result.answer,
      cached: false,
      model: result.model,
      source: result.source,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
