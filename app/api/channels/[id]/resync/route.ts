import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { channels } from "@/lib/schema";
import { backfillSince, ingestChannel } from "@/lib/ingest";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Repair tool: re-runs the full backfill window for one channel. Heals
 * holes an interrupted backfill left behind (the cron's short lookback
 * never would). Safe to run anytime — inserts are deduped by yt_video_id.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, Number(id)));
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  try {
    const videosAdded = await ingestChannel(db, channel, backfillSince());
    return NextResponse.json({ channel: channel.title, videosAdded });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
