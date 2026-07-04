import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { genres } from "@/lib/schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const updates: Partial<typeof genres.$inferInsert> = {};
  if ("askPrompt" in body) {
    updates.askPrompt = String(body.askPrompt ?? "").trim() || null;
  }
  if ("name" in body && String(body.name).trim()) {
    updates.name = String(body.name).trim();
  }
  if ("color" in body) updates.color = String(body.color);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const db = await getDb();
  const [updated] = await db
    .update(genres)
    .set(updates)
    .where(eq(genres.id, Number(id)))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "Genre not found" }, { status: 404 });
  }
  return NextResponse.json({ genre: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  await db.delete(genres).where(eq(genres.id, Number(id)));
  return NextResponse.json({ ok: true });
}
