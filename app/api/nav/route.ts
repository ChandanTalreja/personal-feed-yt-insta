import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { navSummary } from "@/lib/nav";

/** GET /api/nav — counts and sync time for the top bar. */
export async function GET() {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const db = await getDb();
  return NextResponse.json(await navSummary(db));
}
