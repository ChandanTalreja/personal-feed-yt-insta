import { GoogleGenAI, MediaResolution, type Part } from "@google/genai";
import { count, eq, gte } from "drizzle-orm";
import type { Db } from "./db";
import { geminiUsage, videos, type Video } from "./schema";
import { fetchCaptions } from "./transcript";

interface ModelBudget {
  model: string;
  rpd: number;
}

// Free-tier daily budgets per model (from the AI Studio Rate Limit page).
// Override with GEMINI_MODELS="model:rpd,model:rpd,..." — order = priority
// among models with equal remaining budget.
const DEFAULT_CHAIN =
  "gemini-3.1-flash-lite:500,gemini-2.5-flash:20,gemini-2.5-flash-lite:20,gemini-3.5-flash:20";

function modelChain(): ModelBudget[] {
  const raw = process.env.GEMINI_MODELS ?? DEFAULT_CHAIN;
  const chain = raw
    .split(",")
    .map((entry) => {
      const [model, rpd] = entry.trim().split(":");
      return { model, rpd: Number(rpd) || 20 };
    })
    .filter((m) => m.model);
  // A single GEMINI_MODEL override jumps to the front of the chain.
  const preferred = process.env.GEMINI_MODEL?.trim();
  if (preferred) {
    const existing = chain.find((m) => m.model === preferred);
    const rest = chain.filter((m) => m.model !== preferred);
    return [existing ?? { model: preferred, rpd: 500 }, ...rest];
  }
  return chain;
}

/**
 * Ranks models by remaining daily budget, using our own call ledger
 * (Google's API doesn't expose remaining quota). Counts reset at UTC
 * midnight — close enough to Google's Pacific-midnight reset for a
 * personal app; worst case a model 429s and we move down the chain.
 */
async function rankModels(db: Db): Promise<ModelBudget[]> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ model: geminiUsage.model, used: count() })
    .from(geminiUsage)
    .where(gte(geminiUsage.usedAt, dayStart))
    .groupBy(geminiUsage.model);
  const usedByModel = new Map(rows.map((r) => [r.model, Number(r.used)]));

  return modelChain()
    .map((m) => ({ ...m, remaining: m.rpd - (usedByModel.get(m.model) ?? 0) }))
    .filter((m) => m.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);
}

function isQuotaOrMissingModelError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /429|RESOURCE_EXHAUSTED|quota|rate limit|404|NOT_FOUND|not found/i.test(
    msg
  );
}

type VideoRow = Pick<
  Video,
  "id" | "ytVideoId" | "title" | "durationSeconds" | "transcript"
>;

export interface GeminiAnswer {
  answer: string;
  model: string;
  source: "captions" | "video";
}

/** Cached transcript from the DB, else fetch captions once and cache them. */
async function getTranscript(
  db: Db,
  video: VideoRow
): Promise<string | null> {
  if (video.transcript) return video.transcript;
  const captions = await fetchCaptions(video.ytVideoId);
  if (captions) {
    await db
      .update(videos)
      .set({ transcript: captions })
      .where(eq(videos.id, video.id));
  }
  return captions;
}

/**
 * 0 disables watch-once entirely. Default is 0 on Netlify (serverless
 * functions are killed after ~10–26s — long before a watch finishes — so
 * the attempt burns tokens and returns nothing) and 90 minutes locally.
 * Set GEMINI_WATCH_MAX_MINUTES explicitly to override either default.
 */
function watchLimitMinutes(): number {
  const raw = process.env.GEMINI_WATCH_MAX_MINUTES?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return process.env.NETLIFY ? 0 : 90;
}

/** Runs the model chain (most remaining budget first) on the given parts. */
async function runChain(
  db: Db,
  parts: Part[],
  videoMode: boolean
): Promise<{ text: string; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at aistudio.google.com and add it to your environment."
    );
  }

  // App-level daily cap across ALL models — protects the quota from
  // enthusiasm and mischief alike, independent of per-model limits.
  const dailyLimit = Number(process.env.GEMINI_DAILY_LIMIT) || 100;
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [{ usedToday }] = await db
    .select({ usedToday: count() })
    .from(geminiUsage)
    .where(gte(geminiUsage.usedAt, dayStart));
  if (Number(usedToday) >= dailyLimit) {
    throw new Error(
      `Daily AI budget reached (${dailyLimit} Gemini calls today). It resets ` +
        `at midnight UTC — or raise GEMINI_DAILY_LIMIT if this is too tight.`
    );
  }

  const candidates = await rankModels(db);
  if (candidates.length === 0) {
    throw new Error(
      "All Gemini models have used up today's free budget — try again tomorrow."
    );
  }

  const ai = new GoogleGenAI({ apiKey: key });
  let lastError: unknown;
  for (const { model } of candidates) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: videoMode
          ? { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW }
          : {},
      });
      const text = res.text;
      if (!text) throw new Error("Gemini returned an empty response.");
      await db.insert(geminiUsage).values({
        model,
        tokens: res.usageMetadata?.totalTokenCount ?? null,
      });
      return { text: text.trim(), model };
    } catch (err) {
      lastError = err;
      // Quota exhausted or model id unknown on this account → next model.
      // Content problems (unavailable video etc.) would fail everywhere,
      // so don't burn the rest of the chain on them.
      if (isQuotaOrMissingModelError(err)) continue;
      const msg = String((err as Error)?.message ?? err);
      if (
        videoMode &&
        /INVALID_ARGUMENT|FAILED_PRECONDITION|not supported|unavailable|PERMISSION_DENIED/i.test(
          msg
        )
      ) {
        throw new Error(
          "Gemini couldn't access this video — it may be age-restricted, " +
            "private, members-only, or region-locked. The official player " +
            "may still work."
        );
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Request failed on every available model.");
}

/**
 * For caption-less videos: Gemini watches once (1 frame per 10s + low
 * resolution ≈ 40 tokens/second — an hour of footage fits one free-tier
 * request), transcribes what it heard, and the transcript is cached on the
 * video row. Every later summary/ask on that video is then a cheap text call.
 */
async function watchAndTranscribe(db: Db, video: VideoRow): Promise<string> {
  const maxMinutes = watchLimitMinutes();
  if (maxMinutes <= 0) {
    throw new Error(
      "This video has no captions on YouTube, so there is no transcript to " +
        "read. Watching the video with Gemini is disabled on this " +
        "deployment (serverless functions time out before a watch " +
        "finishes). Open the app locally to transcribe it once — the " +
        "result is cached and works everywhere after that."
    );
  }
  if (video.durationSeconds > maxMinutes * 60) {
    throw new Error(
      `This video is ${Math.round(video.durationSeconds / 60)} minutes long ` +
        `and has no captions to read. Watch-the-video requests are capped at ` +
        `${maxMinutes} minutes to stay inside Gemini's free per-request limit.`
    );
  }
  const parts: Part[] = [
    {
      fileData: {
        fileUri: `https://www.youtube.com/watch?v=${video.ytVideoId}`,
      },
      videoMetadata: { fps: 0.1 },
    },
    {
      text:
        `This is the YouTube video "${video.title}". Transcribe its spoken ` +
        `content as plain readable text, with a [mm:ss] timestamp at each ` +
        `topic change. Do not add commentary — transcript only.`,
    },
  ];
  const result = await runChain(db, parts, true);
  await db
    .update(videos)
    .set({ transcript: result.text })
    .where(eq(videos.id, video.id));
  return result.text;
}

/**
 * Core engine for everything Gemini does with a video: get text for the
 * video (cached transcript → captions → one-time Gemini watch), then answer
 * the instructions from that text.
 */
export async function askGemini(
  db: Db,
  video: VideoRow,
  instructions: string
): Promise<GeminiAnswer> {
  let transcript = await getTranscript(db, video);
  let source: "captions" | "video" = "captions";
  if (!transcript) {
    transcript = await watchAndTranscribe(db, video);
    source = "video";
  }

  const parts: Part[] = [
    {
      text:
        `Here is the transcript of the YouTube video titled "${video.title}":\n\n` +
        `"""${transcript}"""\n\n${instructions}`,
    },
  ];
  const result = await runChain(db, parts, false);
  return { answer: result.text, model: result.model, source };
}

export async function summarizeVideo(
  db: Db,
  video: VideoRow
): Promise<GeminiAnswer> {
  return askGemini(
    db,
    video,
    `Summarize it in 3-5 short bullet points covering the key takeaways, ` +
      `then one final line starting with "Worth watching if:" describing who ` +
      `should spend time on it. Be concrete and concise; plain text bullets ` +
      `only, no markdown headers.`
  );
}

export async function answerAboutVideo(
  db: Db,
  video: VideoRow,
  question: string
): Promise<GeminiAnswer> {
  return askGemini(
    db,
    video,
    `Answer the following about this video's content, based only on what is ` +
      `actually in it. Be thorough but organized (plain text, short bullets ` +
      `where it helps).\n\nQuestion: ${question}`
  );
}

/**
 * Full transcript: captions when available (no Gemini call at all),
 * otherwise Gemini listens once and transcribes; cached on the video row
 * either way.
 */
export async function transcribeVideo(
  db: Db,
  video: VideoRow
): Promise<{ transcript: string; source: "captions" | "video" }> {
  const cached = await getTranscript(db, video);
  if (cached) return { transcript: cached, source: "captions" };
  const transcript = await watchAndTranscribe(db, video);
  return { transcript, source: "video" };
}
