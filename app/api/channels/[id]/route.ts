import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { channels } from "@/lib/schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const updates: Partial<typeof channels.$inferInsert> = {};
  if ("genreId" in body) {
    updates.genreId = body.genreId === null ? null : Number(body.genreId);
  }
  if ("isActive" in body) updates.isActive = !!body.isActive;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const db = await getDb();
  const [updated] = await db
    .update(channels)
    .set(updates)
    .where(eq(channels.id, Number(id)))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  return NextResponse.json({ channel: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  await db.delete(channels).where(eq(channels.id, Number(id)));
  return NextResponse.json({ ok: true });
}
