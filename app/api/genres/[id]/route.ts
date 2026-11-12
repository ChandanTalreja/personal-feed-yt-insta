import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { genres } from "@/lib/schema";
import { isHexColor } from "@/lib/color";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const body = await req.json();
  const updates: PgUpdateSetSource<typeof genres> = {};
  if ("askPrompt" in body) {
    updates.askPrompt = String(body.askPrompt ?? "").trim() || null;
  }
  if ("name" in body && String(body.name).trim()) {
    updates.name = String(body.name).trim();
  }
  if ("color" in body) {
    if (!isHexColor(body.color)) {
      return NextResponse.json(
        { error: "Color must be a hex value like #FFC900." },
        { status: 400 }
      );
    }
    updates.color = body.color;
  }
  if ("hiddenFromAll" in body) {
    const hidden = Boolean(body.hiddenFromAll);
    updates.hiddenFromAll = hidden;
    // FEAT-20: hiding starts the "N new" count now; saving a genre that was
    // already hidden (the edit box sends every field) keeps its count.
    updates.hiddenSeenAt = hidden
      ? sql`CASE WHEN ${genres.hiddenFromAll} THEN ${genres.hiddenSeenAt} ELSE now() END`
      : null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "There's nothing to change." }, { status: 400 });
  }
  const db = await getDb();
  const [updated] = await db
    .update(genres)
    .set(updates)
    .where(eq(genres.id, id))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "That genre doesn't exist anymore." }, { status: 404 });
  }
  return NextResponse.json({ genre: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const db = await getDb();
  await db.delete(genres).where(eq(genres.id, id));
  return NextResponse.json({ ok: true });
}
