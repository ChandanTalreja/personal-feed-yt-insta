// ---------- Remembered replies (instant screens) ----------
//
// Screens show the last reply they got for a request straight away, then
// fetch a fresh one and swap it in. Kept in this tab's memory only (gone on
// reload), capped so it can't grow, and never on the server (where one Map
// would be shared between requests).
//
// Staying honest: a change made through api() forgets the remembered replies
// it can make stale, and only those (staleAfter, audit B4), so the other
// screens still open at once. Channels, genres, logging in and a sync can
// touch almost anything, so they forget everything. The feed's frequent
// ✓ / bookmark / progress changes don't forget; they update the remembered
// feed pages in place (updateRemembered), as do a video's note, answers and
// summary, from the screen that changed them.

const MAX_REMEMBERED = 30;
const remembered = new Map<string, unknown>();
const inBrowser = typeof window !== "undefined";

/** The last reply remembered for this exact path (with its query), if any. */
export function rememberedReply<T = ApiReply>(path: string): T | undefined {
  return inBrowser ? (remembered.get(path) as T | undefined) : undefined;
}

/** Keep a reply for next time (newest kept; the oldest dropped past the cap). */
export function remember(path: string, reply: unknown): void {
  if (!inBrowser) return;
  remembered.delete(path);
  remembered.set(path, reply);
  if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!);
}

/** Rewrite every remembered reply whose path starts with `prefix`. */
export function updateRemembered<T>(prefix: string, update: (reply: T) => T): void {
  for (const [path, reply] of remembered) {
    if (path.startsWith(prefix)) remembered.set(path, update(reply as T));
  }
}

/** Forget everything remembered (after a change, so nothing stale shows). */
export function forgetRemembered(): void {
  remembered.clear();
}

/** Forget the remembered replies whose path starts with any of `prefixes`. */
function forgetStartingWith(prefixes: string[]): void {
  for (const path of [...remembered.keys()]) {
    if (prefixes.some((prefix) => path.startsWith(prefix))) remembered.delete(path);
  }
}

/**
 * The remembered replies a change to `path` can make stale, as path prefixes,
 * or "all" when it could be anything (or isn't listed: the safe default).
 */
function staleAfter(path: string): string[] | "all" {
  // A video's note, answers, summary or transcript: its own replies, the
  // Notebook, the top bar's Notebook count, and the tracks' video lists.
  const video = path.match(/^\/api\/videos\/(\d+)(?:[/?]|$)/);
  if (video) return [`/api/videos/${video[1]}/`, "/api/notebook", "/api/nav", "/api/tracks/"];
  // A track: the Tracks screens, the top bar's count, and the "In N tracks"
  // on feed cards.
  if (/^\/api\/tracks(?:[/?]|$)/.test(path)) return ["/api/tracks", "/api/nav", "/api/videos?"];
  // A hidden genre opened (FEAT-20): only the feed lists carry its badge.
  if (/^\/api\/genres\/\d+\/seen$/.test(path)) return ["/api/videos?"];
  if (path.startsWith("/api/cheat-sheets")) return ["/api/cheat-sheets"];
  if (path.startsWith("/api/sticky-notes")) return ["/api/sticky-notes"];
  if (path.startsWith("/api/ask-suggestions")) return ["/api/ask-suggestions"];
  return "all";
}

/**
 * How screens call our own API: send JSON, get JSON back, and turn a failed
 * reply into an Error carrying the server's message (`{ error }`), or
 * `fallback` when it sent none. Browser-side only. A successful GET is
 * remembered (see above); a change, or a sync, forgets what it made stale.
 */
export async function api<T = ApiReply>(
  path: string,
  {
    method = "GET",
    body,
    keepalive,
    fallback = "Something went wrong",
  }: {
    method?: string;
    /** Sent as JSON. */
    body?: unknown;
    /** Let the request finish even if the page or panel closes (last autosave). */
    keepalive?: boolean;
    /** The message when the server didn't send one. */
    fallback?: string;
  } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      keepalive,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    // The request never reached the server ("Failed to fetch"): say why in
    // plain words. Ask, Summary and the like need a live connection.
    throw new Error(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "You're offline. This needs a connection."
        : "Couldn't reach the server. Please try again."
    );
  }
  // A reply that isn't JSON (a crashed function, a proxy error page) reads as {}.
  const data = await res.json().catch(() => ({}));
  // A change (or a sync, which is a GET): forget what it may have made stale,
  // even if it failed, as part of it may have happened.
  const changes = method !== "GET" || path.startsWith("/api/cron");
  if (changes) {
    const stale = staleAfter(path);
    if (stale === "all") forgetRemembered();
    else forgetStartingWith(stale);
  }
  if (!res.ok) throw new Error(data.error ?? fallback);
  if (!changes) remember(path, data);
  return data as T;
}

// Replies are shaped per route; callers read the fields they need, as they
// did with res.json(), which is untyped too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiReply = any;
