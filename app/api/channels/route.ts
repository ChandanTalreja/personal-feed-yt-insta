import { NextRequest, NextResponse } from "next/server";
import { desc, eq, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { channels, genres, videos } from "@/lib/schema";
import { resolveChannel } from "@/lib/youtube";
import {
  BACKFILL_BUDGET_MS,
  backfillChannel,
  backfillSince,
  resolveBackfillMonths,
} from "@/lib/ingest";

export const maxDuration = 60;

export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const db = await getDb();
  const rows = await db
    .select({
      channel: channels,
      genre: genres,
    })
    .from(channels)
    .leftJoin(genres, eq(channels.genreId, genres.id))
    .orderBy(desc(channels.addedAt));

  // Per channel, in one grouped pass over its videos: how many of each kind
  // are stored (the feed sidebar's archive-size counts, deliberately
  // independent of watched state), and when it last uploaded — the Channels
  // page's "last upload" and "quiet for months" status. Nothing new is
  // stored; it's all derived from the videos already ingested.
  const stats = await db
    .select({
      channelId: videos.channelId,
      videoCount: sql<number>`count(*) FILTER (WHERE ${videos.isShort} = false)::int`,
      shortCount: sql<number>`count(*) FILTER (WHERE ${videos.isShort} = true)::int`,
      lastUploadAt: max(videos.publishedAt),
    })
    .from(videos)
    .groupBy(videos.channelId);
  const byChannel = new Map(stats.map((s) => [s.channelId, s]));

  return NextResponse.json({
    channels: rows.map((row) => {
      const s = byChannel.get(row.channel.id);
      return {
        ...row,
        videoCount: Number(s?.videoCount ?? 0),
        shortCount: Number(s?.shortCount ?? 0),
        lastUploadAt: s?.lastUploadAt ?? null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  // The clock starts now: resolving the channel counts toward the budget.
  const started = Date.now();
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  try {
    const body = await req.json();
    const input = String(body.input ?? "").trim();
    const genreId = body.genreId ? Number(body.genreId) : null;
    // "How far back" picker sends years (1–5); clamp to a real window here so
    // the message can report exactly what was pulled. Omitted → default.
    const backfillMonths = resolveBackfillMonths(
      body.years != null ? Number(body.years) * 12 : null
    );
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

    // Same time budget as /backfill: a busy channel with a deep window may
    // not finish in one request; `cursor` tells the page to carry on there.
    const step = await backfillChannel(db, inserted, backfillSince(backfillMonths), {
      deadline: started + BACKFILL_BUDGET_MS,
    });
    return NextResponse.json({
      channel: inserted,
      videosAdded: step.added,
      cursor: step.cursor,
      backfillMonths,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
