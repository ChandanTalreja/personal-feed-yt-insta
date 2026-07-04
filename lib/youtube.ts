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
    throw new Error(
      `YouTube API ${path} failed (${res.status}): ${body.slice(0, 300)}`
    );
  }
  return res.json();
}

export interface ResolvedChannel {
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
  return {
    ytChannelId: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl ?? null,
    thumbnail:
      item.snippet.thumbnails?.medium?.url ??
      item.snippet.thumbnails?.default?.url ??
      null,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
}

/**
 * Walks a channel's uploads playlist (newest first) and returns video ids
 * published on or after `since`. Each page of 50 costs 1 quota unit.
 */
export async function listUploadsSince(
  uploadsPlaylistId: string,
  since: Date,
  maxPages = 20
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await yt("playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    let sawOlder = false;
    for (const item of data.items ?? []) {
      const published = new Date(item.contentDetails.videoPublishedAt ?? 0);
      if (published >= since) {
        ids.push(item.contentDetails.videoId);
      } else {
        sawOlder = true;
      }
    }
    pageToken = data.nextPageToken;
    if (sawOlder || !pageToken) break;
  }
  return ids;
}

export interface VideoDetails {
  ytVideoId: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number;
  isLive: boolean;
  publishedAt: Date;
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
        title: item.snippet.title,
        thumbnail:
          item.snippet.thumbnails?.maxres?.url ??
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url ??
          null,
        durationSeconds: parseISODuration(item.contentDetails.duration),
        isLive: !!item.liveStreamingDetails,
        publishedAt: new Date(item.snippet.publishedAt),
      });
    }
  }
  return out;
}

export function parseISODuration(duration: string | undefined): number {
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
