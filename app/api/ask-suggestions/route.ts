import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { getAskSuggestions, setAskSuggestions } from "@/lib/askSuggestions";

/** GET /api/ask-suggestions — the everyday Ask suggestions. */
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  return NextResponse.json({ suggestions: await getAskSuggestions(db) });
}

/** PUT /api/ask-suggestions — replace the list: { suggestions: string[] }. */
export async function PUT(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const suggestions = await setAskSuggestions(db, body.suggestions);
  return NextResponse.json({ suggestions });
}
