// Caption fetching is a graceful-degradation chain:
//   1. InnerTube (Android client) — free, works from residential IPs.
//      YouTube blocks this route from datacenter IPs (Netlify/AWS), so it
//      is skipped on Netlify and the chain starts at:
//   2. Apify transcript Actor — only when APIFY_TOKEN is set (i.e. on the
//      hosted deployment). ~$0.005/video from the recurring free credit.
//   3. null — callers treat it as "no captions" (Gemini watches the video
//      where the platform allows it, or surfaces a friendly error).
// If Apify itself is down (timeout / error status), fetchCaptions throws a
// "service isn't responding" error instead of returning null — the video
// does have captions, we just can't reach them right now.
//
// Backup: Firecrawl (only when FIRECRAWL_API_KEY is set). It is NOT tried
// on every Apify hiccup — a circuit breaker counts Apify failures in a row,
// and only after 3 does it switch new transcripts to Firecrawl for 30
// minutes; then Apify gets one try again (success → back to normal,
// failure → another 30 minutes). Brief blips cost no Firecrawl credits;
// the user just asks again. The count lives in app_meta, because each
// Netlify request may run in a fresh instance with no memory.

import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { onNetlify } from "./hosting";
import { appMeta } from "./schema";

const ANDROID_UA =
  "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip";

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string; // "asr" = auto-generated
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function fetchCaptions(
  db: Db,
  ytVideoId: string
): Promise<string | null> {
  // YouTube refuses InnerTube from cloud IPs (Netlify runs on AWS), so on
  // Netlify the try only cost a round trip before Apify. Locally it works
  // and is free.
  if (!onNetlify()) {
    const viaInnerTube = await fetchViaInnerTube(ytVideoId);
    if (viaInnerTube) return viaInnerTube;
  }
  // No backup configured: Apify alone, no breaker to keep.
  if (!process.env.APIFY_TOKEN || !process.env.FIRECRAWL_API_KEY) {
    return fetchViaApify(ytVideoId);
  }

  const breaker = await readBreaker(db);
  if (breaker.openUntil != null && breaker.openUntil > Date.now()) {
    return fetchViaFirecrawl(ytVideoId);
  }
  // Normal — or the one test try after a 30-minute break.
  try {
    const text = await fetchViaApify(ytVideoId);
    // Apify answered (even "no captions" is an answer): the streak is over.
    if (breaker.failures > 0) await writeBreaker(db, { failures: 0, openUntil: null });
    return text;
  } catch (err) {
    if (!(err instanceof TranscriptServiceDown)) throw err;
    const failures = breaker.failures + 1;
    if (failures < BREAKER_THRESHOLD) {
      await writeBreaker(db, { failures, openUntil: null });
      throw err;
    }
    await writeBreaker(db, { failures, openUntil: Date.now() + BREAKER_OPEN_MS });
    throw new TranscriptServiceDown(
      "The transcript service hasn't responded several times in a row, so " +
        "for the next 30 minutes the app will use its backup instead. Ask " +
        "again now."
    );
  }
}

/** Apify failures in a row that switch transcripts to the backup. */
const BREAKER_THRESHOLD = 3;
/** How long the backup is used before Apify gets another try. */
const BREAKER_OPEN_MS = 30 * 60_000;
const BREAKER_KEY = "transcript_breaker";

interface Breaker {
  /** Apify failures in a row (any answer resets it to 0). */
  failures: number;
  /** While in the future, Apify is skipped and Firecrawl is used. */
  openUntil: number | null;
}

async function readBreaker(db: Db): Promise<Breaker> {
  const [row] = await db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, BREAKER_KEY));
  try {
    const parsed = JSON.parse(row?.value ?? "{}") as Partial<Breaker>;
    return { failures: Number(parsed.failures) || 0, openUntil: parsed.openUntil ?? null };
  } catch {
    return { failures: 0, openUntil: null };
  }
}

async function writeBreaker(db: Db, breaker: Breaker): Promise<void> {
  const value = JSON.stringify(breaker);
  const now = new Date();
  await db
    .insert(appMeta)
    .values({ key: BREAKER_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: now } });
}

async function fetchViaInnerTube(
  ytVideoId: string
): Promise<string | null> {
  try {
    const player = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": ANDROID_UA,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "20.10.38",
              androidSdkVersion: 34,
              hl: "en",
            },
          },
          videoId: ytVideoId,
        }),
        // A hang here would hold up the whole request; give up and let the
        // next source try.
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      }
    );
    if (!player.ok) return null;
    const data = await player.json();
    const tracks: CaptionTrack[] =
      data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    if (!tracks.length) return null;

    const track =
      tracks.find(
        (t) => t.languageCode?.startsWith("en") && t.kind !== "asr"
      ) ??
      tracks.find((t) => t.languageCode?.startsWith("en")) ??
      tracks[0];

    const res = await fetch(`${track.baseUrl}&fmt=json3`, {
      headers: { "user-agent": ANDROID_UA },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw) return null;

    let text: string;
    if (raw.trimStart().startsWith("{")) {
      const json = JSON.parse(raw) as {
        events?: { segs?: { utf8?: string }[] }[];
      };
      text = (json.events ?? [])
        .flatMap((e) => e.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("");
    } else {
      // srv3 XML — strip tags, decode entities
      text = decodeEntities(raw.replace(/<[^>]*>/g, " "));
    }
    text = text.replace(/\s+/g, " ").trim();

    // Guard against junk and runaway length (~150K chars keeps even
    // multi-hour transcripts well inside every model's token budget).
    return text.length > 40 ? text.slice(0, 150_000) : null;
  } catch {
    return null;
  }
}

/**
 * Hosted fallback: an Apify transcript Actor fetches captions through the
 * provider's own YouTube access, sidestepping the datacenter-IP block.
 * Runs ONLY when APIFY_TOKEN is set (deployment env), so local development
 * never touches it. run-sync waits for the Actor and returns its dataset
 * in one request (typically ~5s); the abort guard keeps us inside the
 * hosting platform's function timeout.
 */
async function fetchViaApify(ytVideoId: string): Promise<string | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  const actor =
    process.env.APIFY_TRANSCRIPT_ACTOR ?? "starvibe~youtube-video-transcript";
  // English first. Videos whose captions are in another language only
  // (e.g. Hindi) come back empty for "en", so retry once with no language —
  // the Actor then returns the video's default caption track. Costs one
  // extra run (~$0.005), once ever per such video; Gemini reads any
  // language and answers in English.
  //
  // The retry is only for an *empty* answer. If the Actor doesn't answer at
  // all (timeout, 503), a second 15s wait would push the request past
  // Netlify's ~30s cut-off and the user would get a bare 502 — so we stop
  // and say the service is down instead.
  const english = await runTranscriptActor(actor, token, ytVideoId, "en");
  if (english === SERVICE_DOWN) throw new TranscriptServiceDown();
  if (english) return english;
  const anyLanguage = await runTranscriptActor(actor, token, ytVideoId);
  if (anyLanguage === SERVICE_DOWN) throw new TranscriptServiceDown();
  return anyLanguage;
}

/** The Actor didn't answer (timeout, network, or an error status). */
const SERVICE_DOWN = Symbol("transcript service down");

/**
 * Not "this video has no captions" — the captions exist, we just can't
 * reach the service that fetches them. Nothing is cached, so a later try
 * works once the service is back. Its own class so the breaker can tell
 * it from any other error.
 */
class TranscriptServiceDown extends Error {
  constructor(
    message = "The transcript service isn't responding right now, so this " +
      "video's captions couldn't be fetched. Try again in a few minutes."
  ) {
    super(message);
  }
}

/**
 * The backup, used only while the breaker is open. Firecrawl returns the
 * whole watch page as Markdown; the captions are the section under a
 * "## Transcript" heading (the video's default track, in any language —
 * verified identical in length to InnerTube's text on a 1h44m English and
 * a Hindi video). No such heading = the video has no captions.
 */
async function fetchViaFirecrawl(ytVideoId: string): Promise<string | null> {
  const bothDown = () =>
    new TranscriptServiceDown(
      "Neither transcript service is responding right now, so this video's " +
        "captions couldn't be fetched. Try again in a few minutes."
    );
  let markdown: unknown;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${ytVideoId}`,
        formats: ["markdown"],
      }),
      // ~5–14s measured; the transcript is saved before Gemini runs, so even
      // a slow one isn't lost if the request then runs long.
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`firecrawl transcript: HTTP ${res.status} for ${ytVideoId}`);
      throw bothDown();
    }
    const json = (await res.json()) as { data?: { markdown?: unknown } };
    markdown = json?.data?.markdown;
  } catch (err) {
    if (err instanceof TranscriptServiceDown) throw err;
    console.error(`firecrawl transcript failed for ${ytVideoId}: ${(err as Error).message}`);
    throw bothDown();
  }
  if (typeof markdown !== "string") throw bothDown();

  const heading = /^## Transcript[ \t]*$/m.exec(markdown);
  if (!heading) return null;
  let section = markdown.slice(heading.index + heading[0].length);
  const nextHeading = section.search(/^## /m);
  if (nextHeading >= 0) section = section.slice(0, nextHeading);
  const text = section.replace(/\s+/g, " ").trim();
  return text.length > 40 ? text.slice(0, 150_000) : null;
}

async function runTranscriptActor(
  actor: string,
  token: string,
  ytVideoId: string,
  language?: string
): Promise<string | null | typeof SERVICE_DOWN> {
  try {
    const url =
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items` +
      `?token=${token}&maxTotalChargeUsd=0.05`;
    const input: Record<string, unknown> = {
      youtube_url: `https://www.youtube.com/watch?v=${ytVideoId}`,
      include_transcript_text: true,
    };
    if (language) input.language = language;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `apify transcript: HTTP ${res.status} for ${ytVideoId}` +
          (language ? ` (language=${language})` : " (default language)")
      );
      return SERVICE_DOWN;
    }
    const items = (await res.json()) as { transcript_text?: string }[];
    const text = items?.[0]?.transcript_text?.replace(/\s+/g, " ").trim();
    if (!text || text.length <= 40) return null;
    return text.slice(0, 150_000);
  } catch (err) {
    console.error(
      `apify transcript failed for ${ytVideoId}: ${(err as Error).message}`
    );
    return SERVICE_DOWN;
  }
}
