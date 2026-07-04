// YouTube locked classic caption downloads behind browser-only tokens in
// 2025, but the Android client's player API still hands out working caption
// URLs. One POST + one GET per video; falls back to null on any failure,
// which callers treat as "no captions" (Gemini then watches the video).

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
