import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { genres } from "@/lib/schema";
import { isHexColor } from "@/lib/color";
import { listGenres } from "@/lib/genres";

export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const db = await getDb();
  return NextResponse.json({ genres: await listGenres(db) });
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const color = body.color ?? "#FFC900";
    const askPrompt = String(body.askPrompt ?? "").trim() || null;
    if (!name) {
      return NextResponse.json({ error: "Give the genre a name." }, { status: 400 });
    }
    if (!isHexColor(color)) {
      return NextResponse.json(
        { error: "Color must be a hex value like #FFC900." },
        { status: 400 }
      );
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
