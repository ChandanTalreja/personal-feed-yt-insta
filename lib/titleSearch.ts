import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { Db } from "./db";
import { looseSqlPattern } from "./looseMatch";

// Title search, shared by the feed's "Filter this list" and ⌘K's videos
// (FEAT-24). Instead of "do these letters appear anywhere", it counts how
// many of your words each title has:
// - a word counts fully when a word in the title STARTS with it ("rag" →
//   "RAG", "RAGs"; "microservice" → "Microservices"), half when it's hidden
//   inside another word ("rag" in "Storage"), a little when a title word only
//   looks like it (typos; words of 5+ letters only, since short words look
//   like everything: "rag" ~ "RabbitMQ", "five" ~ "live", "first");
// - rarer words count for more (Kafka is in a few titles, "explained" in
//   thousands), and the whole search as typed counts extra;
// - a title must have your word, both of two words, or at least half of
//   three or more; small words ("in", "the") are ignored. Order doesn't
//   matter.

/** Words too common to search by. Kept if they're all you typed. */
const SMALL_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "is", "are", "with",
  "by", "from", "as", "it", "its", "my", "your", "every", "all", "this", "that", "vs", "how",
]);

/** At most this many words are matched; the rest are ignored. */
const MAX_WORDS = 8;

/** The words of a search worth matching: lower case, outer punctuation
 *  trimmed (but C++, C#, .NET and Node.js kept whole), no repeats. */
export function searchWords(term: string): string[] {
  const raw = term
    .toLowerCase()
    .split(/\s+/)
    .map((w) =>
      w
        .replace(/['’]s$/u, "") // "microservice's" → "microservice"
        .replace(/^[^\p{L}\p{N}.#+]+/u, "")
        .replace(/[^\p{L}\p{N}+#]+$/u, "")
    )
    .filter(Boolean);
  const kept = raw.filter((w) => !SMALL_WORDS.has(w));
  return [...new Set(kept.length ? kept : raw)].slice(0, MAX_WORDS);
}

/** A Postgres regex for `word` taken literally (every non-letter escaped). */
function literal(word: string): string {
  return [...word].map((c) => (/[\p{L}\p{N}]/u.test(c) ? c : `\\${c}`)).join("");
}

/**
 * The SQL for searching `title` by `term`: `where` picks the videos (at least
 * half the words), `rank` orders them (highest first). Null for an empty search.
 */
export function titleSearch(title: SQLWrapper, term: string): { where: SQL; rank: SQL } | null {
  const words = searchWords(term);
  if (words.length === 0) return null;
  const lower = sql`lower(${title})`;

  const parts = words.map((w) => {
    const start = sql`(${title} ~* ${`(^|[^[:alnum:]])${literal(w)}`})`;
    const inside = sql`(strpos(${lower}, ${w}) > 0)`;
    // Typos, for real words of 5+ letters: "kubernets" still finds
    // "Kubernetes". A short typo ("kafak") gets "Did you mean" instead.
    const looks = w.length >= 5 && /^[\p{L}\p{N}]+$/u.test(w) ? sql`(word_similarity(${w}::text, ${lower}) > 0.5)` : null;
    const matched = looks ? sql`(${start} OR ${inside} OR ${looks})` : sql`(${start} OR ${inside})`;
    const hit = looks
      ? sql`(CASE WHEN ${start} THEN 1.0 WHEN ${inside} THEN 0.5 WHEN ${looks} THEN 0.4 ELSE 0 END)`
      : sql`(CASE WHEN ${start} THEN 1.0 WHEN ${inside} THEN 0.5 ELSE 0 END)`;
    // How rare the word is across every stored title: 1 for a word in
    // nearly all of them, up to ~10 for one in a single title. Postgres
    // works it out once per query, not per row.
    const weight = sql`(SELECT ln((count(*) + 1)::float8 / (count(*) FILTER (WHERE strpos(lower(videos.title), ${w}) > 0) + 1)) + 1 FROM videos)`;
    return { matched, hit, weight };
  });

  // One word: it. Two: both (two words typed mean both). More: at least half.
  const need = words.length <= 2 ? words.length : Math.ceil(words.length / 2);
  const count = sql.join(
    parts.map((p) => sql`(${p.matched})::int`),
    sql` + `
  );
  const where = words.length === 1 ? parts[0].matched : sql`((${count}) >= ${need})`;

  // One word: the weight is the same for every title, so it isn't needed.
  if (words.length === 1) return { where, rank: parts[0].hit };

  const score = sql.join(
    parts.map((p) => sql`${p.hit} * ${p.weight}`),
    sql` + `
  );
  // The whole search as typed, loosely ("hash map" finds "HashMap"): worth
  // all the words together, so the exact title wins outright.
  const phrase = looseSqlPattern(term.trim());
  const bonus = phrase
    ? sql` + (CASE WHEN ${title} ~* ${phrase} THEN ${sql.join(parts.map((p) => p.weight), sql` + `)} ELSE 0 END)`
    : sql``;
  return { where, rank: sql`(${score}${bonus})` };
}

/** Optimal string alignment: edits to turn `a` into `b`, a swap of two
 *  neighbouring letters counting as one ("jtw" → "jwt" is 1). */
function slips(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * "Did you mean …?" for a search that found nothing: each word that no
 * title contains is swapped for the closest word that's really in your
 * titles, one slip away for short words (a swapped, missing, extra or wrong
 * letter), two for longer ones. Null when nothing is close. Only runs when a
 * search came back empty, so normal searches never pay for it.
 */
export async function suggestSpelling(db: Db, term: string, section?: "feed" | "podcasts"): Promise<string | null> {
  const words = searchWords(term).filter((w) => /^[\p{L}\p{N}]{3,}$/u.test(w));
  if (words.length === 0) return null;
  const inSection = section
    ? sql`JOIN channels ON channels.id = videos.channel_id WHERE channels.section = ${section}`
    : sql``;

  let changed = false;
  const fixed: string[] = [];
  for (const w of words) {
    const allowed = w.length <= 4 ? 1 : 2;
    // Candidates: real title words (3+ letters) of a similar length, at
    // most 2 edits away (Postgres's levenshtein counts a swap as 2), most
    // common first.
    const rows = (await db.execute(sql`
      SELECT lower(word) AS key, mode() WITHIN GROUP (ORDER BY word) AS shown, count(*)::int AS n
      FROM (SELECT regexp_split_to_table(videos.title, '[^[:alnum:]]+') AS word FROM videos ${inSection}) t
      WHERE length(word) BETWEEN ${Math.max(3, w.length - allowed)} AND ${w.length + allowed}
        AND levenshtein(lower(word), ${w}) <= 2
      GROUP BY lower(word)
      ORDER BY n DESC
      LIMIT 50
    `)) as unknown as { rows?: { key: string; shown: string; n: number }[] } | { key: string; shown: string; n: number }[];
    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    if (list.some((r) => r.key === w)) {
      // The word is in some title; it just didn't meet the others.
      fixed.push(w);
      continue;
    }
    let best: { shown: string; d: number; n: number } | null = null;
    for (const r of list) {
      // A short word only gets a word of the same length with the same first
      // letter: "jtw" → "JWT", but never "ytr" → "Yr".
      if (w.length <= 4 && (r.key.length !== w.length || r.key[0] !== w[0])) continue;
      const d = slips(w, r.key);
      if (d <= allowed && (!best || d < best.d || (d === best.d && r.n > best.n))) {
        best = { shown: r.shown, d, n: r.n };
      }
    }
    if (best) {
      fixed.push(best.shown);
      changed = true;
    } else {
      fixed.push(w);
    }
  }
  return changed ? fixed.join(" ") : null;
}
