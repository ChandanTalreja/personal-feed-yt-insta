import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { searchEverything } from "@/lib/search";

/**
 * GET /api/search?q=… — the top bar's global search: channels, videos, and
 * answers and notes, grouped, with totals. "@term" searches channels only.
 * Read-only; no YouTube or Gemini calls.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const db = await getDb();
  return NextResponse.json(await searchEverything(db, q));
}
