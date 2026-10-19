import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { channels } from "@/lib/schema";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const body = await req.json();
  const updates: Partial<typeof channels.$inferInsert> = {};
  if ("genreId" in body) {
    updates.genreId = body.genreId === null ? null : Number(body.genreId);
  }
  if ("isActive" in body) updates.isActive = !!body.isActive;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "There's nothing to change." }, { status: 400 });
  }
  const db = await getDb();
  const [updated] = await db
    .update(channels)
    .set(updates)
    .where(eq(channels.id, id))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "That channel isn't in your library anymore." }, { status: 404 });
  }
  return NextResponse.json({ channel: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const db = await getDb();
  await db.delete(channels).where(eq(channels.id, id));
  return NextResponse.json({ ok: true });
}
