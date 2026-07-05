// Caption fetching is a graceful-degradation chain:
//   1. InnerTube (Android client) — free, works from residential IPs.
//      YouTube blocks this route from datacenter IPs (Netlify/AWS), so:
//   2. Apify transcript Actor — only when APIFY_TOKEN is set (i.e. on the
//      hosted deployment). ~$0.005/video from the recurring free credit.
//   3. null — callers treat it as "no captions" (Gemini watches the video
//      where the platform allows it, or surfaces a friendly error).

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
  ytVideoId: string
): Promise<string | null> {
  const viaInnerTube = await fetchViaInnerTube(ytVideoId);
  if (viaInnerTube) return viaInnerTube;
  return fetchViaApify(ytVideoId);
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
  try {
    const url =
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items` +
      `?token=${token}&maxTotalChargeUsd=0.05`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        youtube_url: `https://www.youtube.com/watch?v=${ytVideoId}`,
        language: "en",
        include_transcript_text: true,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`apify transcript: HTTP ${res.status} for ${ytVideoId}`);
      return null;
    }
    const items = (await res.json()) as { transcript_text?: string }[];
    const text = items?.[0]?.transcript_text?.replace(/\s+/g, " ").trim();
    if (!text || text.length <= 40) return null;
    return text.slice(0, 150_000);
  } catch (err) {
    console.error(
      `apify transcript failed for ${ytVideoId}: ${(err as Error).message}`
    );
    return null;
  }
}
