import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { genres } from "@/lib/schema";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/**
 * You opened a hidden genre (FEAT-20): what's in it now has been seen, so
 * its "N new" badge starts again from zero. Does nothing for a genre that
 * isn't hidden.
 */
export async function POST(_req: Request, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const db = await getDb();
  await db
    .update(genres)
    .set({ hiddenSeenAt: sql`now()` })
    .where(and(eq(genres.id, id), eq(genres.hiddenFromAll, true)));
  return NextResponse.json({ ok: true });
}
