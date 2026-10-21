// Podcast chapters (FEAT-14). YouTube builds a video's chapters from the
// timestamps its creator lists in the description ("0:00 Intro",
// "05:10 - Early career", "1:02:33 Q&A"). This reads them the same way, so
// what TUBEBOX shows matches what YouTube shows. No network, no quota.

export interface Chapter {
  /** Seconds from the start. */
  start: number;
  title: string;
}

const STAMP = /(?:^|[\s([])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=$|[\s)\]:.\-–—|])/;

function seconds(stamp: string): number {
  return stamp
    .split(":")
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
}

/**
 * The chapters listed in a description, or [] when it has none. YouTube's
 * rules: the first starts at 0:00, there are at least three, in order, at
 * least 10 seconds apart. A list that breaks them isn't chapters (a
 * description quoting a few times, say), so it gives [].
 */
export function parseChapters(description: string | null | undefined, durationSeconds: number): Chapter[] {
  if (!description) return [];
  const found: Chapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = STAMP.exec(line);
    if (!m) continue;
    const title = line
      .replace(m[1], " ")
      .replace(/^[\s([\])\-–—:|•*.]+|[\s([\])\-–—:|•*]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (title) found.push({ start: seconds(m[1]), title: title.slice(0, 120) });
  }
  if (found.length < 3 || found[0].start !== 0) return [];
  for (let i = 1; i < found.length; i++) {
    if (found[i].start - found[i - 1].start < 10) return [];
  }
  if (durationSeconds > 0 && found[found.length - 1].start >= durationSeconds) return [];
  return found;
}
