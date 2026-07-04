import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { genres } from "@/lib/schema";

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const rows = await db.select().from(genres).orderBy(asc(genres.name));
  return NextResponse.json({ genres: rows });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const color = String(body.color ?? "#FFC900");
    const askPrompt = String(body.askPrompt ?? "").trim() || null;
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const db = await getDb();
    const [inserted] = await db
      .insert(genres)
      .values({ name, color, askPrompt })
      .returning();
    return NextResponse.json({ genre: inserted });
  } catch (err) {
    const message = (err as Error).message;
    const friendly = message.includes("unique")
      ? "That genre already exists."
      : message;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
