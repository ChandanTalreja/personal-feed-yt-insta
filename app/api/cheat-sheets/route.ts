import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { CheatSheetError, listCheatSheets, makeCheatSheet } from "@/lib/cheatSheets";

/** Every saved cheat sheet, most recently made or updated first. No Gemini. */
export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const db = await getDb();
  return NextResponse.json({ sheets: await listCheatSheets(db) });
}

/**
 * Makes (or updates) the cheat sheet for { query, genreKey }: the server
 * collects the matching lines from your notes and makes one Gemini call.
 */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  try {
    const sheet = await makeCheatSheet(db, String(body.query ?? ""), String(body.genreKey ?? "all"));
    return NextResponse.json({ sheet });
  } catch (err) {
    const status = err instanceof CheatSheetError ? 400 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
