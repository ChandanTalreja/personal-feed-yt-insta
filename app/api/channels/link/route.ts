import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { videos } from "@/lib/schema";
import { getPlaylist, getVideoDetails, isShortVideo } from "@/lib/youtube";
import { readYouTubeLink } from "@/lib/youtubeLinks";

/**
 * GET /api/channels/link?input=<a pasted link>   (FEAT-25)
 * What a video or playlist link points at, for the add bar to ask about:
 *   { video?: {…}, playlist?: {…} }   (both for a video opened from a playlist)
 * Nothing is stored.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const link = readYouTubeLink(req.nextUrl.searchParams.get("input") ?? "");
  if (!link) {
    return NextResponse.json({ error: "That isn't a YouTube video or playlist link." }, { status: 400 });
  }
  try {
    const [details, playlist] = await Promise.all([
      link.videoId ? getVideoDetails([link.videoId]) : Promise.resolve([]),
      link.listId ? getPlaylist(link.listId) : Promise.resolve(null),
    ]);
    const d = details[0];
    let video = null;
    if (d) {
      const [stored] = await (await getDb())
        .select({ id: videos.id, pickedAt: videos.pickedAt })
        .from(videos)
        .where(inArray(videos.ytVideoId, [d.ytVideoId]));
      video = {
        ytVideoId: d.ytVideoId,
        title: d.title,
        thumbnail: d.thumbnail,
        channelTitle: d.channelTitle,
        durationSeconds: d.durationSeconds,
        isShort: await isShortVideo(d.ytVideoId, d.durationSeconds, d.isLive),
        // Already here: in Picked, or in the feed (a followed channel).
        stored: stored ? (stored.pickedAt ? "picked" : "feed") : null,
      };
    }
    if (!video && !playlist) {
      return NextResponse.json(
        {
          error: link.listId
            ? "YouTube doesn't share that list. Mixes, Watch later, Liked videos and private playlists can't be read."
            : "YouTube has no video there. It may be private, removed or not out yet.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ video, playlist });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
