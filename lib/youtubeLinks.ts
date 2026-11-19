// Reading YouTube video and playlist links (FEAT-25). Pure, so the add bar
// (in the browser) and the routes (on the server) read a link the same way.

export interface YouTubeLink {
  /** The video in the link, when there is one. */
  videoId: string | null;
  /** The playlist in the link (`list=`), when there is one. */
  listId: string | null;
}

const VIDEO_ID = /^[\w-]{11}$/;
const HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

/**
 * A video or playlist link → its ids; null for anything else (a channel
 * link, an @handle or a name, which go to the channel search as before).
 * Knows watch?v=, youtu.be/, /shorts/, /live/, /embed/ and playlist?list=,
 * on www., m. and music. too.
 */
export function readYouTubeLink(input: string): YouTubeLink | null {
  const text = input.trim();
  if (!/youtu\.?be/i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!HOSTS.test(url.hostname)) return null;

  let videoId: string | null = null;
  if (/youtu\.be$/i.test(url.hostname)) {
    videoId = url.pathname.split("/")[1] ?? null;
  } else {
    const m = url.pathname.match(/^\/(shorts|live|embed|v)\/([^/?#]+)/);
    videoId = m ? m[2] : url.searchParams.get("v");
  }
  if (videoId && !VIDEO_ID.test(videoId)) videoId = null;
  const list = url.searchParams.get("list");
  const listId = list && /^[\w-]{2,}$/.test(list) ? list : null;

  return videoId || listId ? { videoId, listId } : null;
}
