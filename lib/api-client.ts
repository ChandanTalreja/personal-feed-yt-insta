// ---------- Remembered replies (instant screens) ----------
//
// Screens show the last reply they got for a request straight away, then
// fetch a fresh one and swap it in. Kept in this tab's memory only (gone on
// reload), capped so it can't grow, and never on the server (where one Map
// would be shared between requests).
//
// Staying honest: any change made through api() (ask, note, track, channel,
// genre, suggestions) or a sync clears every remembered reply, so nothing
// stale outlives an edit. The feed's frequent ✓ / bookmark / progress
// changes don't clear; they update the remembered feed pages in place
// (updateRemembered).

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

/**
 * How screens call our own API: send JSON, get JSON back, and turn a failed
 * reply into an Error carrying the server's message (`{ error }`), or
 * `fallback` when it sent none. Browser-side only. A successful GET is
 * remembered (see above); a change, or a sync, clears what's remembered.
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
  const res = await fetch(path, {
    method,
    keepalive,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  // A reply that isn't JSON (a crashed function, a proxy error page) reads as {}.
  const data = await res.json().catch(() => ({}));
  // A change (or a sync, which is a GET) may have touched anything: forget
  // what's remembered — even if it failed, as part of it may have happened.
  const changes = method !== "GET" || path.startsWith("/api/cron");
  if (changes) forgetRemembered();
  if (!res.ok) throw new Error(data.error ?? fallback);
  if (!changes) remember(path, data);
  return data as T;
}

// Replies are shaped per route; callers read the fields they need, as they
// did with res.json(), which is untyped too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiReply = any;
