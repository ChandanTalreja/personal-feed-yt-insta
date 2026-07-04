import { NextRequest, NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { channels, genres, videos } from "@/lib/schema";
import { resolveChannel } from "@/lib/youtube";
import { backfillSince, ingestChannel } from "@/lib/ingest";

export const maxDuration = 60;

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const rows = await db
    .select({
      channel: channels,
      genre: genres,
    })
    .from(channels)
    .leftJoin(genres, eq(channels.genreId, genres.id))
    .orderBy(desc(channels.addedAt));

  // Total items stored per channel, split by kind, so the feed's channel
  // chips can show archive-size badges (stable numbers that only grow —
  // deliberately independent of watched state). The badge always matches
  // what clicking the chip reveals on that tab.
  const counts = await db
    .select({
      channelId: videos.channelId,
      isShort: videos.isShort,
      total: count(),
    })
    .from(videos)
    .groupBy(videos.channelId, videos.isShort);
  const videosByChannel = new Map<number, number>();
  const shortsByChannel = new Map<number, number>();
  for (const c of counts) {
    (c.isShort ? shortsByChannel : videosByChannel).set(
      c.channelId,
      Number(c.total)
    );
  }

  return NextResponse.json({
    channels: rows.map((row) => ({
      ...row,
      videoCount: videosByChannel.get(row.channel.id) ?? 0,
      shortCount: shortsByChannel.get(row.channel.id) ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const input = String(body.input ?? "").trim();
    const genreId = body.genreId ? Number(body.genreId) : null;
    if (!input) {
      return NextResponse.json(
        { error: "Paste a channel URL, @handle, or channel id." },
        { status: 400 }
      );
    }

    const resolved = await resolveChannel(input);
    const db = await getDb();

    const existing = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.ytChannelId, resolved.ytChannelId));
    if (existing.length > 0) {
      return NextResponse.json(
        { error: `"${resolved.title}" is already in your feed.` },
        { status: 409 }
      );
    }

    const [inserted] = await db
      .insert(channels)
      .values({ ...resolved, genreId })
      .returning();

    const videosAdded = await ingestChannel(db, inserted, backfillSince());
    return NextResponse.json({ channel: inserted, videosAdded });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
