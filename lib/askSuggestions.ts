import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { appMeta } from "./schema";

/** app_meta key holding the everyday Ask suggestions (a JSON array). */
const KEY = "ask_suggestions";
export const MAX_SUGGESTIONS = 3;
const MAX_LENGTH = 200;

/**
 * The questions you ask of almost any video ("Summarise as revision notes"),
 * shown as one-click buttons in the study panel's Ask tab after the genre's
 * own suggestion. Empty by default: nothing shows until you add some.
 */
export async function getAskSuggestions(db: Db): Promise<string[]> {
  const [row] = await db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, KEY));
  if (!row) return [];
  try {
    const list = JSON.parse(row.value);
    return Array.isArray(list) ? list.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** Clean the list (trim, drop blanks and repeats, cap count and length) and save it. */
export async function setAskSuggestions(db: Db, input: unknown): Promise<string[]> {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of raw) {
    const s = String(item ?? "").trim().slice(0, MAX_LENGTH);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    list.push(s);
    if (list.length === MAX_SUGGESTIONS) break;
  }
  const value = JSON.stringify(list);
  const now = new Date();
  await db
    .insert(appMeta)
    .values({ key: KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: now } });
  return list;
}
