import { parseChapters, type Chapter } from "./chapters";
import { readYouTubeLink } from "./youtubeLinks";

const API = "https://www.googleapis.com/youtube/v3";

function apiKey(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) {
    throw new Error(
      "YOUTUBE_API_KEY is not set. Get a free key at console.cloud.google.com (enable YouTube Data API v3) and add it to .env.local"
    );
  }
  return k;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function yt(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey());
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new YouTubeApiError(
      `YouTube API ${path} failed (${res.status}): ${body.slice(0, 300)}`,
      res.status
    );
  }
  return res.json();
}

/** A failed YouTube API call, with its HTTP status. */
class YouTubeApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** YouTube answered 404: e.g. a channel with no live streams has no live list. */
export function isNotFound(err: unknown): boolean {
  return err instanceof YouTubeApiError && err.status === 404;
}

/**
 * Some creators write names in Unicode's "mathematical" bold/italic letters
 * ("𝗦𝘁𝗮𝗿𝗖𝗼𝗱𝗲 𝗞𝗵"). They look like text but are different characters, so
 * typing "star" never matches them. Only that block (U+1D400–U+1D7FF) is
 * turned back into plain letters — a blanket NFKC would also rewrite
 * ordinary titles ("…" → "..."). Applied when a name is first saved; rows
 * already stored are left as they are.
 */
export function plainLetters(text: string): string {
  return text.replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => c.normalize("NFKC"));
}

interface ResolvedChannel {
  ytChannelId: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
  uploadsPlaylistId: string;
}

/**
 * Accepts a channel URL (youtube.com/@handle or youtube.com/channel/UC...),
 * a bare @handle, a bare handle, or a raw UC... channel id.
 */
export async function resolveChannel(input: string): Promise<ResolvedChannel> {
  const trimmed = input.trim();
  let params: Record<string, string>;
  let m: RegExpMatchArray | null;
  if ((m = trimmed.match(/youtube\.com\/channel\/(UC[\w-]+)/i))) {
    params = { id: m[1] };
  } else if ((m = trimmed.match(/youtube\.com\/(@[\w.\-]+)/i))) {
    params = { forHandle: m[1] };
  } else if (/^UC[\w-]{20,}$/.test(trimmed)) {
    params = { id: trimmed };
  } else {
    params = { forHandle: trimmed.startsWith("@") ? trimmed : `@${trimmed}` };
  }
  const data = await yt("channels", {
    part: "snippet,contentDetails",
    ...params,
  });
  let item = data.items?.[0];
  // A pasted video or playlist link isn't a channel name: searching with it
  // could find (and add) some unrelated channel (FEAT-25).
  if (!item && readYouTubeLink(trimmed)) {
    throw new Error("That looks like a video or playlist link, not a channel. Paste it as it is and TUBEBOX offers to add it to Picked.");
  }
  if (!item && !("id" in params)) {
    // Plain-name fallback ("Marques Brownlee"): one search.list call.
    // Costs 100 quota units, so it only runs when the handle lookup misses.
    const search = await yt("search", {
      part: "snippet",
      type: "channel",
      q: trimmed,
      maxResults: "1",
    });
    const channelId = search.items?.[0]?.id?.channelId;
    if (channelId) {
      const byId = await yt("channels", {
        part: "snippet,contentDetails",
        id: channelId,
      });
      item = byId.items?.[0];
    }
  }
  if (!item) {
    throw new Error(
      `Channel not found for "${input}". Try its @handle or full channel URL.`
    );
  }
  return toResolved(item);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toResolved(item: any): ResolvedChannel {
  return {
    ytChannelId: item.id,
    title: plainLetters(item.snippet.title),
    handle: item.snippet.customUrl ?? null,
    thumbnail:
      item.snippet.thumbnails?.medium?.url ??
      item.snippet.thumbnails?.default?.url ??
      null,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
}

/** Several channels by id, 50 per call (1 quota unit each): the channels
 *  of a picked playlist's videos (FEAT-25). Missing ids are left out. */
export async function getChannels(ids: string[]): Promise<ResolvedChannel[]> {
  const out: ResolvedChannel[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await yt("channels", { part: "snippet,contentDetails", id: ids.slice(i, i + 50).join(",") });
    for (const item of data.items ?? []) out.push(toResolved(item));
  }
  return out;
}

/** A playlist's name, owner and size; null when YouTube won't share it (a
 *  Mix, Watch later, Liked videos, or a private playlist). 1 quota unit. */
export async function getPlaylist(
  listId: string
): Promise<{ id: string; title: string; channelTitle: string; count: number; thumbnail: string | null } | null> {
  let data;
  try {
    data = await yt("playlists", { part: "snippet,contentDetails", id: listId });
  } catch (err) {
    if (err instanceof YouTubeApiError && (err.status === 404 || err.status === 403 || err.status === 400)) return null;
    throw err;
  }
  const item = data.items?.[0];
  if (!item) return null;
  return {
    id: item.id,
    title: plainLetters(item.snippet.title),
    channelTitle: plainLetters(item.snippet.channelTitle ?? ""),
    count: item.contentDetails?.itemCount ?? 0,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? null,
  };
}

/** One page (up to 50) of a playlist's videos, in the playlist's order.
 *  1 quota unit. `next` = YouTube's bookmark for the following page. */
export async function listPlaylistPage(
  listId: string,
  pageToken?: string
): Promise<{ ids: string[]; next: string | null }> {
  const data = await yt("playlistItems", {
    part: "contentDetails",
    playlistId: listId,
    maxResults: "50",
    ...(pageToken ? { pageToken } : {}),
  });
  return {
    ids: (data.items ?? []).map((i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId),
    next: data.nextPageToken ?? null,
  };
}

/**
 * Beside its uploads list (UU…), every channel has lists YouTube keeps for
 * its own channel tabs, named by swapping the prefix: UULF… holds only the
 * long videos, UULV… only past live streams (Shorts are in neither). Not in
 * the official docs, so callers fall back to the uploads list on a 404.
 */
export function longVideosList(uploadsPlaylistId: string): string {
  return `UULF${uploadsPlaylistId.slice(2)}`;
}

export function liveStreamsList(uploadsPlaylistId: string): string {
  return `UULV${uploadsPlaylistId.slice(2)}`;
}

/** Only the channel's Shorts (its Shorts tab), same naming (FEAT-22). */
export function shortsList(uploadsPlaylistId: string): string {
  return `UUSH${uploadsPlaylistId.slice(2)}`;
}

/** A channel's uploads list is its id with "UU" for "UC". */
export function uploadsListOf(ytChannelId: string): string {
  return `UU${ytChannelId.slice(2)}`;
}

/**
 * One page (up to 50) of a channel's uploads playlist, newest first, keeping
 * only videos published on or after `since`. Costs 1 quota unit.
 *
 * `next` is YouTube's bookmark for the following page — or null when there's
 * nothing more to read (the end of the playlist, or this page already
 * reached videos older than `since`). Passing it back as `pageToken` carries
 * on exactly where this page stopped, even from a later request.
 */
export async function listUploadsPage(
  uploadsPlaylistId: string,
  since: Date,
  pageToken?: string
): Promise<{ ids: string[]; next: string | null }> {
  const data = await yt("playlistItems", {
    part: "contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: "50",
    ...(pageToken ? { pageToken } : {}),
  });
  const ids: string[] = [];
  let sawOlder = false;
  for (const item of data.items ?? []) {
    const published = new Date(item.contentDetails.videoPublishedAt ?? 0);
    if (published >= since) {
      ids.push(item.contentDetails.videoId);
    } else {
      sawOlder = true;
    }
  }
  return { ids, next: sawOlder ? null : (data.nextPageToken ?? null) };
}

interface VideoDetails {
  /** From the description (lib/chapters.ts); [] when it lists none. */
  chapters: Chapter[];
  ytVideoId: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number;
  isLive: boolean;
  publishedAt: Date;
  /** Whose video it is (a playlist can mix creators, FEAT-25). */
  ytChannelId: string;
  channelTitle: string;
}

export async function getVideoDetails(
  ids: string[]
): Promise<VideoDetails[]> {
  const out: VideoDetails[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await yt("videos", {
      part: "snippet,contentDetails,liveStreamingDetails",
      id: batch.join(","),
    });
    for (const item of data.items ?? []) {
      // Skip streams that are upcoming or currently live; the finished VOD
      // gets picked up on a later run once liveBroadcastContent is "none".
      if (
        item.snippet.liveBroadcastContent &&
        item.snippet.liveBroadcastContent !== "none"
      ) {
        continue;
      }
      out.push({
        ytVideoId: item.id,
        title: plainLetters(item.snippet.title),
        thumbnail:
          item.snippet.thumbnails?.maxres?.url ??
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url ??
          null,
        durationSeconds: parseISODuration(item.contentDetails.duration),
        // The description comes with the snippet we already ask for, so
        // reading chapters costs nothing extra.
        chapters: parseChapters(item.snippet.description, parseISODuration(item.contentDetails.duration)),
        isLive: !!item.liveStreamingDetails,
        publishedAt: new Date(item.snippet.publishedAt),
        ytChannelId: item.snippet.channelId,
        channelTitle: plainLetters(item.snippet.channelTitle ?? ""),
      });
    }
  }
  return out;
}

/**
 * Chapters for one already-stored video (videos saved before chapters were
 * read). 1 quota unit. null = YouTube no longer has the video.
 */
export async function fetchVideoChapters(ytVideoId: string): Promise<Chapter[] | null> {
  const data = await yt("videos", { part: "snippet,contentDetails", id: ytVideoId });
  const item = data.items?.[0];
  if (!item) return null;
  return parseChapters(item.snippet.description, parseISODuration(item.contentDetails.duration));
}

function parseISODuration(duration: string | undefined): number {
  const m = duration?.match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  );
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (
    (Number(d) || 0) * 86400 +
    (Number(h) || 0) * 3600 +
    (Number(min) || 0) * 60 +
    (Number(s) || 0)
  );
}

/**
 * Shorts share the uploads playlist with regular videos. The reliable tell:
 * youtube.com/shorts/<id> answers 200 for a Short and redirects otherwise.
 * Only videos short enough to qualify (<= ~3 min) are checked.
 */
export async function isShortVideo(
  ytVideoId: string,
  durationSeconds: number,
  isLive: boolean
): Promise<boolean> {
  if (isLive || durationSeconds === 0 || durationSeconds > 185) return false;
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${ytVideoId}`, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
    });
    return res.status === 200;
  } catch {
    return durationSeconds <= 65;
  }
}
