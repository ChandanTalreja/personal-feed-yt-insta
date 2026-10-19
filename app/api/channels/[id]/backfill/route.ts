import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { channels } from "@/lib/schema";
import {
  BACKFILL_BUDGET_MS,
  backfillChannel,
  backfillSince,
  resolveBackfillMonths,
} from "@/lib/ingest";
import { badId, parseId } from "@/lib/http";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/channels/:id/backfill  { years: 1–5, cursor?: string }
 *
 * "Make sure every upload from the last N years is here." Fetches the
 * channel's uploads in that window and adds the missing ones — a repair
 * (backfill 1Y heals gaps) and a way to reach further back (backfill 3Y on a
 * channel added with 1Y). Safe to repeat: stored videos are skipped.
 *
 * Works within a time budget: if there's more to read when it runs out, it
 * returns `cursor`, and the page calls again with it to carry on. Replaces
 * the old /resync, which always used the default 12 months.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const started = Date.now();
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const body = await req.json().catch(() => ({}));
  const months = resolveBackfillMonths(Number(body.years) * 12);
  const cursor = typeof body.cursor === "string" ? body.cursor : null;

  const db = await getDb();
  const [channel] = await db.select().from(channels).where(eq(channels.id, id));
  if (!channel) {
    return NextResponse.json({ error: "That channel isn't in your library anymore." }, { status: 404 });
  }
  try {
    const step = await backfillChannel(db, channel, backfillSince(months), {
      cursor,
      deadline: started + BACKFILL_BUDGET_MS,
    });
    return NextResponse.json({
      channel: channel.title,
      videosAdded: step.added,
      cursor: step.cursor,
      months,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
