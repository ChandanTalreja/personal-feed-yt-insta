// Watch progress: which parts of a video have actually been played.
//
// A video is split into 10-second chunks; progress is a string with one
// character per chunk ("1" = played, "0" = not), e.g. "1110000000". It is
// merged with OR, so sittings add up, rewatching a part never double-counts,
// and saves that arrive out of order can never lose coverage. A one-hour
// video is 360 characters. Shared by the player (client) and the API
// (server) so both apply exactly the same rules.

export const CHUNK_SECONDS = 10;

/** Covered share of a video at which it counts as watched. */
export const WATCHED_THRESHOLD = 0.5;

const PROGRESS_PATTERN = /^[01]{0,4000}$/;

export function isValidProgress(value: unknown): value is string {
  return typeof value === "string" && PROGRESS_PATTERN.test(value);
}

export function chunkCount(durationSeconds: number): number {
  return Math.max(1, Math.ceil(durationSeconds / CHUNK_SECONDS));
}

/** Chunk-wise OR of two progress strings (missing chunks count as "0"). */
export function mergeProgress(a: string | null, b: string | null): string {
  const x = a ?? "";
  const y = b ?? "";
  let out = "";
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    out += x[i] === "1" || y[i] === "1" ? "1" : "0";
  }
  return out;
}

/** Share of the video covered, 0–1. Unknown duration (0) → 0. */
export function coveredRatio(
  progress: string | null,
  durationSeconds: number
): number {
  if (!progress || durationSeconds <= 0) return 0;
  const total = chunkCount(durationSeconds);
  let played = 0;
  for (let i = 0; i < Math.min(progress.length, total); i++) {
    if (progress[i] === "1") played++;
  }
  return Math.min(1, played / total);
}
