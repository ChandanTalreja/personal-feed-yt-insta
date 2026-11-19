import { and, inArray, isNull } from "drizzle-orm";
import type { Db } from "./db";
import { backfillSince, storePage } from "./ingest";
import { channels, videos, type Channel } from "./schema";
import { addVideos, createTrack, TrackError } from "./tracks";
import {
  getChannels,
  getVideoDetails,
  isNotFound,
  isShortVideo,
  listPlaylistPage,
  listUploadsPage,
  liveStreamsList,
  longVideosList,
  shortsList,
  uploadsListOf,
} from "./youtube";

// Pick videos instead of following a channel (FEAT-22): the picker lists a
// channel's uploads (or, FEAT-25, a playlist's videos) to tick; saving
// stores only the ticked ones, each under its own channel, which is added as
// picked (never synced) when it's new. Picked videos are ordinary rows in
// `videos`: the feed, Notebook, tracks and search need nothing new.

export type PickKind = "videos" | "shorts";

/** One video in the picker's list. */
export interface PickItem {
  ytVideoId: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number;
  publishedAt: string;
  isLive: boolean;
  isShort: boolean;
  /** Whose video it is: a playlist can mix creators. */
  channelTitle: string;
  /** Already in TUBEBOX: shown ticked, can't be unticked. */
  have: boolean;
}

/** Where the list comes from: a channel's uploads, or a playlist. */
export type PickSource =
  | { ytChannelId: string; kind: PickKind; years: number }
  | { playlistId: string; podcasts: boolean };

/**
 * Which YouTube list a page comes from. A channel's Videos: its long videos
 * ("LF"), then past live streams ("LV"), the lists Podcasts read; its
 * Shorts: the Shorts list ("SH"); "UU" (every upload) only when YouTube has
 * no LF or SH list, each upload then checked. A playlist: "PL".
 */
type PickList = "LF" | "LV" | "SH" | "UU" | "PL";

/** The most videos stored in one save; a page holds 50. */
export const MAX_PICK = 100;

/** Pages read in one request before handing a cursor back (a page whose
 *  uploads are all the other kind comes back empty). */
const MAX_PAGES_PER_CALL = 3;

class PickError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function pickErrorStatus(err: unknown): number {
  if (err instanceof PickError || err instanceof TrackError) return err.status;
  return 500;
}

function playlistFor(uploads: string, list: PickList): string {
  if (list === "LF") return longVideosList(uploads);
  if (list === "LV") return liveStreamsList(uploads);
  if (list === "SH") return shortsList(uploads);
  return uploads;
}

/**
 * One page of the picker's list, with `cursor` ("LF:<bookmark>") to carry on
 * and null at the end. A channel: newest first, published in the last
 * `years`. A playlist: in its own order, all of it. About 2 quota units a
 * page (the list and its details); stores nothing.
 */
export async function listPickPage(
  db: Db,
  source: PickSource,
  cursor?: string | null
): Promise<{ items: PickItem[]; cursor: string | null }> {
  const fromPlaylist = "playlistId" in source;
  const m = cursor?.match(/^(LF|LV|SH|UU|PL):(.*)$/);
  let list: PickList = m
    ? (m[1] as PickList)
    : fromPlaylist
      ? "PL"
      : source.kind === "shorts"
        ? "SH"
        : "LF";
  let token: string | undefined = m?.[2] || undefined;
  // A playlist in Podcasts leaves its Shorts out (FEAT-14); a channel's
  // Videos and Shorts are its two tabs.
  const keepShorts = fromPlaylist ? (source.podcasts ? false : null) : source.kind === "shorts";

  const items: PickItem[] = [];
  for (let page = 0; page < MAX_PAGES_PER_CALL; page++) {
    let reply: { ids: string[]; next: string | null };
    try {
      reply = fromPlaylist
        ? await listPlaylistPage(source.playlistId, token)
        : await listUploadsPage(playlistFor(uploadsListOf(source.ytChannelId), list), backfillSince(source.years * 12), token);
    } catch (err) {
      if (!isNotFound(err) || list === "UU" || list === "PL") throw err;
      // No past live streams: the videos are done.
      if (list === "LV") return { items, cursor: null };
      // No long or Shorts list for this channel: read every upload instead.
      list = "UU";
      token = undefined;
      continue;
    }

    // Details come back in any order; keep the list's own.
    const byId = new Map((await getVideoDetails(reply.ids)).map((d) => [d.ytVideoId, d]));
    const details = reply.ids.map((id) => byId.get(id)).filter((d) => d != null);
    // The Shorts list holds only Shorts. Elsewhere the short-enough ones
    // are checked (the sync's check): a new Short can sit in the long list.
    const shortFlags =
      list === "SH"
        ? details.map(() => true)
        : await Promise.all(details.map((d) => isShortVideo(d.ytVideoId, d.durationSeconds, d.isLive)));
    const wanted = details
      .map((d, i) => ({ d, isShort: shortFlags[i] }))
      .filter((x) => keepShorts == null || x.isShort === keepShorts);

    const stored = wanted.length
      ? await db
          .select({ ytVideoId: videos.ytVideoId })
          .from(videos)
          .where(inArray(videos.ytVideoId, wanted.map((x) => x.d.ytVideoId)))
      : [];
    const have = new Set(stored.map((v) => v.ytVideoId));
    for (const { d, isShort } of wanted) {
      items.push({
        ytVideoId: d.ytVideoId,
        title: d.title,
        thumbnail: d.thumbnail,
        durationSeconds: d.durationSeconds,
        publishedAt: d.publishedAt.toISOString(),
        isLive: d.isLive,
        isShort,
        channelTitle: d.channelTitle,
        have: have.has(d.ytVideoId),
      });
    }

    if (reply.next) {
      token = reply.next;
    } else if (list === "LF") {
      list = "LV";
      token = undefined;
    } else {
      return { items, cursor: null };
    }
    if (items.length > 0) break;
  }
  return { items, cursor: `${list}:${token ?? ""}` };
}

/**
 * Stores the ticked videos and puts them in Picked. Each goes under its own
 * channel: one already here keeps its genre and home; a new one is added as
 * picked (inactive, so the sync skips it) with `genreId` and `section`. A
 * video already stored is just marked picked. With `trackName`, the videos
 * also become a track in the order given (a playlist's order).
 *
 * Returns the channels involved, how many videos were new to TUBEBOX, how
 * many went into Picked now, and the track when one was made.
 */
export async function pickVideos(
  db: Db,
  opts: {
    ytVideoIds: string[];
    genreId: number | null;
    section: "feed" | "podcasts";
    trackName?: string | null;
  }
): Promise<{
  channels: Channel[];
  added: number;
  picked: number;
  track: { id: number; name: string } | null;
}> {
  const ids = [...new Set(opts.ytVideoIds)].filter((id) => /^[\w-]{11}$/.test(id));
  if (ids.length === 0) throw new PickError("Pick at least one video.", 400);
  if (ids.length > MAX_PICK) throw new PickError(`Add up to ${MAX_PICK} videos at a time.`, 400);

  // Whose videos they are. Upcoming or live-right-now ones have no details
  // yet and are left out (the sync takes the same view).
  const details = await getVideoDetails(ids);
  if (details.length === 0) throw new PickError("YouTube has no video to add there (it may be private, removed or not out yet).", 404);
  const ownerOf = new Map(details.map((d) => [d.ytVideoId, d.ytChannelId]));
  const ownerIds = [...new Set(details.map((d) => d.ytChannelId))];

  const known = await db.select().from(channels).where(inArray(channels.ytChannelId, ownerIds));
  const byYt = new Map(known.map((c) => [c.ytChannelId, c]));
  const missing = ownerIds.filter((id) => !byYt.has(id));
  const created: Channel[] = [];
  if (missing.length) {
    const found = await getChannels(missing);
    if (found.length) {
      const rows = await db
        .insert(channels)
        .values(found.map((c) => ({ ...c, genreId: opts.genreId, section: opts.section, isActive: false, picked: true })))
        .onConflictDoNothing()
        .returning();
      for (const c of rows) {
        byYt.set(c.ytChannelId, c);
        created.push(c);
      }
    }
  }

  try {
    let added = 0;
    for (const channel of byYt.values()) {
      const mine = ids.filter((id) => ownerOf.get(id) === channel.ytChannelId);
      if (mine.length === 0) continue;
      // Podcasts never hold Shorts (FEAT-14).
      added += await storePage(db, channel.id, mine, channel.section === "podcasts");
    }
    // Into Picked, newest pick first. A video picked before keeps its date.
    const stamped = await db
      .update(videos)
      .set({ pickedAt: new Date() })
      .where(and(inArray(videos.ytVideoId, ids), isNull(videos.pickedAt)))
      .returning({ id: videos.id });

    let track: { id: number; name: string } | null = null;
    if (opts.trackName?.trim()) {
      const rows = await db
        .select({ id: videos.id, ytVideoId: videos.ytVideoId })
        .from(videos)
        .where(inArray(videos.ytVideoId, ids));
      const idOf = new Map(rows.map((r) => [r.ytVideoId, r.id]));
      const ordered = ids.map((id) => idOf.get(id)).filter((n) => n != null);
      if (ordered.length) {
        const made = await createTrackNamed(db, opts.trackName.trim());
        await addVideos(db, made.id, ordered, "given");
        track = { id: made.id, name: made.name };
      }
    }

    const involved = [...byYt.values()].filter((c) => ids.some((id) => ownerOf.get(id) === c.ytChannelId));
    return { channels: involved, added, picked: stamped.length, track };
  } catch (err) {
    // A channel added just now that got none of its videos would sit there empty.
    if (created.length) {
      await db.delete(channels).where(inArray(channels.id, created.map((c) => c.id)));
    }
    throw err;
  }
}

/** A track named after the playlist; "Name 2", "Name 3"… if it's taken. */
async function createTrackNamed(db: Db, name: string) {
  const base = name.slice(0, 56);
  for (let n = 1; n <= 9; n++) {
    try {
      return await createTrack(db, n === 1 ? base : `${base} ${n}`);
    } catch (err) {
      if (!(err instanceof TrackError) || err.status !== 409) throw err;
    }
  }
  throw new PickError(`You already have tracks called "${base}" up to "${base} 9".`, 409);
}
