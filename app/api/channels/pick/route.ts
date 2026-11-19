import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { listPickPage, pickErrorStatus, pickVideos, type PickSource } from "@/lib/pick";

/**
 * GET /api/channels/pick?channel=UC…&kind=videos|shorts&years=1–5&cursor=…
 * GET /api/channels/pick?playlist=PL…&section=feed|podcasts&cursor=…
 * One page of a channel's uploads (FEAT-22) or a playlist's videos (FEAT-25)
 * to tick. Reads YouTube only; nothing is stored.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const q = req.nextUrl.searchParams;
  const ytChannelId = q.get("channel") ?? "";
  const playlistId = q.get("playlist") ?? "";
  let source: PickSource;
  if (/^[\w-]{2,}$/.test(playlistId)) {
    source = { playlistId, podcasts: q.get("section") === "podcasts" };
  } else if (/^UC[\w-]{20,}$/.test(ytChannelId)) {
    source = {
      ytChannelId,
      kind: q.get("kind") === "shorts" ? "shorts" : "videos",
      years: Math.min(5, Math.max(1, Math.round(Number(q.get("years")) || 1))),
    };
  } else {
    return NextResponse.json({ error: "Unknown channel or playlist." }, { status: 400 });
  }
  try {
    const db = await getDb();
    return NextResponse.json(await listPickPage(db, source, q.get("cursor")));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/channels/pick
 *   { ytVideoIds: string[], genreId?, section?, trackName? }
 * Stores the ticked videos and puts them in Picked, each under its own
 * channel (new ones added as picked); with trackName, also a track.
 */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  try {
    const db = await getDb();
    const result = await pickVideos(db, {
      ytVideoIds: Array.isArray(body.ytVideoIds) ? body.ytVideoIds.map(String) : [],
      genreId: body.genreId ? Number(body.genreId) : null,
      section: body.section === "podcasts" ? "podcasts" : "feed",
      trackName: typeof body.trackName === "string" ? body.trackName : null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: pickErrorStatus(err) });
  }
}
