import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { listFeedVideos, parseFeedQuery } from "@/lib/feedVideos";

/**
 * The Feed's and Podcasts' video list for the given filters. The logic lives
 * in lib/feedVideos.ts, shared with the pages that send their first screen
 * with the HTML (audit B1).
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const db = await getDb();
  return NextResponse.json(await listFeedVideos(db, parseFeedQuery(req.nextUrl.searchParams)));
}
