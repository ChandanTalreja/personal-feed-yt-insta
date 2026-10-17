import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { getAskSuggestions, setAskSuggestions } from "@/lib/askSuggestions";

/** GET /api/ask-suggestions — the everyday Ask suggestions. */
export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const db = await getDb();
  return NextResponse.json({ suggestions: await getAskSuggestions(db) });
}

/** PUT /api/ask-suggestions — replace the list: { suggestions: string[] }. */
export async function PUT(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const suggestions = await setAskSuggestions(db, body.suggestions);
  return NextResponse.json({ suggestions });
}
