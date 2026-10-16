import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { navSummary } from "@/lib/nav";

/** GET /api/nav — counts and sync time for the top bar. */
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  return NextResponse.json(await navSummary(db));
}
