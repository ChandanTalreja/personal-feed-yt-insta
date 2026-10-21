import { GoogleGenAI, MediaResolution, Type, type Part, type Schema } from "@google/genai";
import { count, eq, gte } from "drizzle-orm";
import type { Db } from "./db";
import { geminiUsage, videos, type Video } from "./schema";
import { onNetlify } from "./hosting";
import { fetchCaptions } from "./transcript";
import type { CheatSheetLine, CheatSheetQuestion } from "./cheatSheetLines";

interface ModelBudget {
  model: string;
  rpd: number;
}

// Free-tier daily budgets per model (from the AI Studio Rate Limit page),
// in the order they're tried: the two 500/day Flash-Lites do the work, the
// 20/day Flash models are backups for when both are busy or used up.
// Override with GEMINI_MODELS="model:rpd,model:rpd,...".
const DEFAULT_CHAIN =
  "gemini-3.5-flash-lite:500,gemini-3.1-flash-lite:500,gemini-3.8-flash:20,gemini-3.7-flash:20";

const BUSY_MESSAGE = "Gemini is busy right now. Please try again in a minute.";
const FAILED_MESSAGE = "Gemini couldn't answer right now. Please try again.";
const QUOTA_MESSAGE =
  "All Gemini models have used up today's free budget. Please try again tomorrow.";

// A busy model gets one more try after this pause before we move on.
const BUSY_RETRY_DELAY_MS = 1000;

// Netlify cuts a request off at ~30 s. Past this point no new attempt is
// started, so the friendly message arrives instead of a timeout. Locally
// there's no cut-off (and a watch-the-video call can take minutes).
function attemptWindowMs(): number {
  return onNetlify() ? 20_000 : Infinity;
}

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
 * The chain in its fixed order, minus models that have used up today's
 * budget by our own call ledger (Google's API doesn't expose remaining
 * quota). Counts reset at UTC midnight — close enough to Google's
 * Pacific-midnight reset for a personal app; worst case a model 429s and
 * we move down the chain.
 */
async function availableModels(db: Db): Promise<ModelBudget[]> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ model: geminiUsage.model, used: count() })
    .from(geminiUsage)
    .where(gte(geminiUsage.usedAt, dayStart))
    .groupBy(geminiUsage.model);
  const usedByModel = new Map(rows.map((r) => [r.model, Number(r.used)]));

  return modelChain().filter(
    (m) => m.rpd - (usedByModel.get(m.model) ?? 0) > 0
  );
}

/**
 * What a failed call means for the chain:
 * - "busy": Google is overloaded or had a server error (503/500/504) —
 *   worth one more try on the same model, then the next model.
 * - "skip": this model can't serve us (out of quota, unknown id, empty
 *   answer) — go straight to the next model.
 * - "fatal": a problem with the request itself (bad input, video not
 *   accessible) — every model would fail the same way, so stop.
 */
function classifyError(err: unknown): "busy" | "skip" | "fatal" {
  const status = (err as { status?: unknown })?.status;
  if (status === 500 || status === 503 || status === 504) return "busy";
  if (status === 429 || status === 404) return "skip";
  const msg = String((err as Error)?.message ?? err);
  if (/\b(500|503|504)\b|UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|overloaded|high demand|fetch failed|ECONNRESET|socket hang up/i.test(msg))
    return "busy";
  if (/\b(429|404)\b|RESOURCE_EXHAUSTED|NOT_FOUND|quota|rate limit|not found|empty answer/i.test(msg))
    return "skip";
  return "fatal";
}

type VideoRow = Pick<
  Video,
  "id" | "ytVideoId" | "title" | "durationSeconds" | "transcript"
>;

interface GeminiAnswer {
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
  const captions = await fetchCaptions(db, video.ytVideoId);
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

/**
 * Runs the model chain (in its fixed order) on the given parts. `jsonSchema`
 * asks for a JSON reply in that shape instead of prose.
 */
async function runChain(
  db: Db,
  parts: Part[],
  videoMode: boolean,
  jsonSchema?: Schema
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
      `You've reached today's AI limit (${dailyLimit} Gemini calls). It resets ` +
        `at midnight UTC, or you can raise GEMINI_DAILY_LIMIT.`
    );
  }

  const candidates = await availableModels(db);
  if (candidates.length === 0) {
    throw new Error(QUOTA_MESSAGE);
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const started = Date.now();
  const outOfTime = () => Date.now() - started > attemptWindowMs();
  let sawBusy = false;
  let sawQuota = false;
  // Fixed order: the first model that answers wins. Raw API errors (often
  // JSON) only go to the server log; the user gets a plain sentence.
  for (const { model } of candidates) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (outOfTime()) throw new Error(BUSY_MESSAGE);
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: videoMode
            ? { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW }
            : jsonSchema
              ? { responseMimeType: "application/json", responseSchema: jsonSchema }
              : {},
        });
        const text = res.text;
        if (!text) throw new Error("Gemini sent back an empty answer.");
        await db.insert(geminiUsage).values({
          model,
          tokens: res.usageMetadata?.totalTokenCount ?? null,
        });
        return { text: text.trim(), model };
      } catch (err) {
        const kind = classifyError(err);
        const msg = String((err as Error)?.message ?? err);
        console.error(
          `[gemini] ${model} try ${attempt} failed (${kind}): ${msg.slice(0, 300)}`
        );
        if (kind === "fatal") {
          if (
            videoMode &&
            /INVALID_ARGUMENT|FAILED_PRECONDITION|not supported|unavailable|PERMISSION_DENIED/i.test(
              msg
            )
          ) {
            throw new Error(
              "Gemini couldn't access this video. It may be age-restricted, " +
                "private, members-only or region-locked. The YouTube player " +
                "may still play it."
            );
          }
          throw new Error(FAILED_MESSAGE);
        }
        if (kind === "skip") {
          const status = (err as { status?: unknown })?.status;
          if (status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg))
            sawQuota = true;
          break; // next model
        }
        sawBusy = true;
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, BUSY_RETRY_DELAY_MS));
        }
      }
    }
  }
  throw new Error(
    sawBusy ? BUSY_MESSAGE : sawQuota ? QUOTA_MESSAGE : FAILED_MESSAGE
  );
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
      "This video has no captions on YouTube, so there's no transcript to " +
        "read. Gemini can't watch videos on the hosted site (it would time " +
        "out), but running TUBEBOX on your laptop can transcribe it once. " +
        "After that it works everywhere."
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
async function askGemini(
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

const CHEAT_SHEET_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      answer: { type: Type.STRING },
      sources: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    },
    required: ["question", "sources"],
  },
};

/**
 * Cheat sheets (FEAT-15), part 2: one Gemini call turns the excerpts about
 * a topic (lib/cheatSheetLines.ts) into its unique questions. Videos are
 * numbered 1…n in the prompt (shorter than ids, and Gemini can't invent an
 * id that exists); the reply is JSON, checked here, so a garbled or made-up
 * source never reaches the screen. Most-asked questions come first.
 */
export async function buildCheatSheet(
  db: Db,
  topic: string,
  lines: CheatSheetLine[]
): Promise<{ questions: CheatSheetQuestion[]; model: string }> {
  const videoIds = [...new Set(lines.flatMap((l) => l.videoIds))];
  const number = new Map(videoIds.map((id, i) => [id, i + 1]));
  const excerpts = lines
    .map((l) => `[${l.videoIds.map((id) => number.get(id)).join(",")}] ${l.text}`)
    .join("\n\n");

  const prompt =
    `You are making a revision cheat sheet about "${topic}" from someone's notes on ` +
    `${videoIds.length} YouTube videos. Below are excerpts from those notes. Each ` +
    `excerpt starts with the number(s) of the video(s) it came from, like [3] or [3,7].\n\n` +
    `List every distinct question about "${topic}" in the excerpts. Write each as one ` +
    `clear question, even if the notes phrase it as a statement or a topic. When ` +
    `several excerpts ask the same thing, merge them into ONE question and include ` +
    `every video number it came from. Include questions under a heading about ` +
    `"${topic}" even if they don't name it; skip anything else unrelated. For each ` +
    `question, give a short answer (one or two sentences) only if the excerpts ` +
    `contain one, such as a "Solution:" line; otherwise leave "answer" empty. Never ` +
    `add questions or answers that aren't in the excerpts.\n\nExcerpts:\n\n${excerpts}`;

  const result = await runChain(db, [{ text: prompt }], false, CHEAT_SHEET_SCHEMA);
  let raw: unknown;
  try {
    raw = JSON.parse(result.text);
  } catch {
    throw new Error("Gemini's reply couldn't be read. Please try again.");
  }
  const questions: CheatSheetQuestion[] = [];
  for (const q of Array.isArray(raw) ? raw : []) {
    const question = typeof q?.question === "string" ? q.question.trim() : "";
    const ids = [
      ...new Set(
        (Array.isArray(q?.sources) ? q.sources : [])
          .map((n: unknown) => videoIds[Number(n) - 1])
          .filter((id: number | undefined): id is number => id !== undefined)
      ),
    ] as number[];
    if (!question || ids.length === 0) continue;
    const answer = typeof q?.answer === "string" && q.answer.trim() ? q.answer.trim() : null;
    questions.push({ question, answer, videoIds: ids });
  }
  if (questions.length === 0) {
    throw new Error(`Gemini didn't find any questions about "${topic}" in those notes.`);
  }
  // Stable sort: equally common questions keep Gemini's order.
  questions.sort((a, b) => b.videoIds.length - a.videoIds.length);
  return { questions, model: result.model };
}
