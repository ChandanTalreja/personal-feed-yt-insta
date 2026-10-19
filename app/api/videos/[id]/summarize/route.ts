import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { videos } from "@/lib/schema";
import { summarizeVideo } from "@/lib/gemini";
import { badId, parseId } from "@/lib/http";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const db = await getDb();
  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id));
  if (!video) {
    return NextResponse.json({ error: "That video isn't in your library anymore." }, { status: 404 });
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
