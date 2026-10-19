import { count, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "./db";
import { appMeta, tracks, videoNotes, videos } from "./schema";
import { LAST_SYNC_FAILED_KEY, LAST_SYNC_KEY } from "./ingest";

export interface NavSummary {
  /** Unwatched videos and shorts — the Feed tab's count. */
  inbox: number;
  /** Saved Ask answers + personal notes — the Notebook tab's count. */
  notebook: number;
  /** Learning tracks. */
  tracks: number;
  /** When the last full sync finished (ISO), or null if never. */
  lastSyncAt: string | null;
  /** Channels that sync couldn't check (the amber dot); empty when all were. */
  lastSyncFailed: string[];
}

function parseList(value: string | undefined): string[] {
  try {
    const list = JSON.parse(value ?? "[]");
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

/** Everything the top bar shows, gathered in one parallel round trip. */
export async function navSummary(db: Db): Promise<NavSummary> {
  const [[inbox], [answers], [notes], [trackCount], syncRows] = await Promise.all([
    db.select({ n: count() }).from(videos).where(eq(videos.watched, false)),
    db.select({ n: count() }).from(videoNotes),
    db.select({ n: count() }).from(videos).where(isNotNull(videos.personalNote)),
    db.select({ n: count() }).from(tracks),
    db
      .select({ key: appMeta.key, value: appMeta.value })
      .from(appMeta)
      .where(inArray(appMeta.key, [LAST_SYNC_KEY, LAST_SYNC_FAILED_KEY])),
  ]);
  const meta = new Map(syncRows.map((r) => [r.key, r.value]));
  return {
    inbox: Number(inbox?.n ?? 0),
    notebook: Number(answers?.n ?? 0) + Number(notes?.n ?? 0),
    tracks: Number(trackCount?.n ?? 0),
    lastSyncAt: meta.get(LAST_SYNC_KEY) ?? null,
    lastSyncFailed: parseList(meta.get(LAST_SYNC_FAILED_KEY)),
  };
}
