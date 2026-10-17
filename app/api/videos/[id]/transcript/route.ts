import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { videos } from "@/lib/schema";
import { transcribeVideo } from "@/lib/gemini";
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
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  try {
    const result = await transcribeVideo(db, video);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
