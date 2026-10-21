import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db";
import { appMeta, channels, videos, type Channel } from "./schema";
import { getVideoDetails, isShortVideo, listUploadsPage } from "./youtube";

/** Deepest window the add-channel picker offers: 5 years. A caller-supplied
 *  window is clamped to this so a backfill can't walk a channel's entire
 *  upload history. */
const MAX_BACKFILL_MONTHS = 60;

/**
 * Resolve a backfill depth in months. An explicit request (the add-channel
 * "how far back" picker) is clamped to 1–60 months (1–5 years); omitted →
 * the configured default (`BACKFILL_MONTHS`, or 12 = one year). RE-SYNC and
 * any caller passing nothing get that default.
 */
export function resolveBackfillMonths(months?: number | null): number {
  if (months == null || Number.isNaN(months)) {
    return Number(process.env.BACKFILL_MONTHS) || 12;
  }
  return Math.min(MAX_BACKFILL_MONTHS, Math.max(1, Math.round(months)));
}

export function backfillSince(months?: number | null): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - resolveBackfillMonths(months));
  return d;
}

/** Safety net for a run with no time budget: 20 pages = the 1,000 newest uploads. */
const MAX_PAGES_UNBUDGETED = 20;

/**
 * Stores one page of upload ids: skips the ones we already have, fetches
 * details for the rest, works out which are shorts, and inserts them.
 * Returns how many were added.
 */
async function storePage(
  db: Db,
  channelId: number,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const existing = await db
    .select({ ytVideoId: videos.ytVideoId })
    .from(videos)
    .where(inArray(videos.ytVideoId, ids));
  const existingIds = new Set(existing.map((v) => v.ytVideoId));
  const freshIds = ids.filter((id) => !existingIds.has(id));
  if (freshIds.length === 0) return 0;

  const details = await getVideoDetails(freshIds);
  const shortFlags = await Promise.all(
    details.map((d) => isShortVideo(d.ytVideoId, d.durationSeconds, d.isLive))
  );
  const rows = details.map((d, i) => ({
    ytVideoId: d.ytVideoId,
    channelId,
    title: d.title,
    thumbnail: d.thumbnail,
    durationSeconds: d.durationSeconds,
    isShort: shortFlags[i],
    isLive: d.isLive,
    publishedAt: d.publishedAt,
    chapters: d.chapters,
    chaptersSource: d.chapters.length ? "youtube" : null,
  }));
  if (rows.length > 0) {
    await db.insert(videos).values(rows).onConflictDoNothing();
  }
  return rows.length;
}

interface BackfillStep {
  /** Videos added by this call. */
  added: number;
  /** Where to carry on (YouTube's page bookmark), or null when finished. */
  cursor: string | null;
}

/**
 * Fetches a channel's uploads published after `since`, one page of 50 at a
 * time, saving each page before reading the next — so if the request is cut
 * off, everything up to that point is kept.
 *
 * With a `deadline` (a timestamp), it stops *starting* new pages once that
 * time has passed and returns the bookmark of the next page as `cursor`;
 * calling again with that cursor carries on exactly there. That's how a deep
 * backfill of a busy channel fits Netlify's 10-second limit: several short
 * requests instead of one long one that gets killed. Already-stored videos
 * are skipped, so overlapping or repeated runs are harmless.
 */
export async function backfillChannel(
  db: Db,
  channel: Pick<Channel, "id" | "uploadsPlaylistId">,
  since: Date,
  opts: { cursor?: string | null; deadline?: number } = {}
): Promise<BackfillStep> {
  let cursor: string | undefined = opts.cursor ?? undefined;
  let added = 0;
  for (let page = 0; ; page++) {
    if (opts.deadline == null && page >= MAX_PAGES_UNBUDGETED) break;
    if (opts.deadline != null && page > 0 && Date.now() > opts.deadline) {
      return { added, cursor: cursor ?? null };
    }
    const { ids, next } = await listUploadsPage(channel.uploadsPlaylistId, since, cursor);
    added += await storePage(db, channel.id, ids);
    if (!next) break;
    cursor = next;
  }
  return { added, cursor: null };
}

/**
 * The whole job in one go, no time budget — the scheduled sync's short
 * lookback (a page or two per channel). Same result as before, but saved
 * page by page.
 */
async function ingestChannel(
  db: Db,
  channel: Pick<Channel, "id" | "uploadsPlaylistId">,
  since: Date
): Promise<number> {
  return (await backfillChannel(db, channel, since)).added;
}

/**
 * Time budget for one backfill request. Netlify stops a request at 10 s;
 * a page can take ~2 s (list, details, shorts check, insert), so no new page
 * starts after 6 s.
 */
export const BACKFILL_BUDGET_MS = 6_000;

const CRON_LOOKBACK_DAYS = 14;

/** Channels checked at the same time during a refresh. */
const REFRESH_CONCURRENCY = 5;

interface RefreshResult {
  channels: number;
  added: number;
  errors: string[];
  /** Titles of the channels that couldn't be checked this time. */
  failed: string[];
  /** Channels that actually had new videos, e.g. [{ title, added }] */
  breakdown: { title: string; added: number }[];
  /** When this sync finished (ISO). */
  syncedAt: string;
}

/** app_meta key holding the last full sync time. */
export const LAST_SYNC_KEY = "last_sync_at";

/** app_meta key holding the titles of channels the last sync couldn't check (JSON array). */
export const LAST_SYNC_FAILED_KEY = "last_sync_failed";

export async function refreshAllChannels(db: Db): Promise<RefreshResult> {
  const active = await db
    .select()
    .from(channels)
    .where(eq(channels.isActive, true));
  const since = new Date(Date.now() - CRON_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // A few channels at a time, not one after another: each channel is mostly
  // waiting on YouTube, and one-by-one took ~25s for the whole list — so a
  // cold start (~2–5s) pushed it past Netlify's 30s cut-off. Same YouTube
  // calls, same quota; just fewer waits in a row. Channels never share
  // videos, and inserts skip duplicates anyway, so the order doesn't matter.
  const outcomes: ({ count: number } | { error: string })[] = new Array(active.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < active.length) {
      const i = nextIndex++;
      try {
        outcomes[i] = { count: await ingestChannel(db, active[i], since) };
      } catch (err) {
        outcomes[i] = { error: (err as Error).message };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(REFRESH_CONCURRENCY, active.length) }, worker)
  );

  // Totals in channel order, as before.
  let added = 0;
  const errors: string[] = [];
  const breakdown: { title: string; added: number }[] = [];
  outcomes.forEach((outcome, i) => {
    const { title } = active[i];
    if ("error" in outcome) {
      errors.push(`${title}: ${outcome.error}`);
    } else {
      added += outcome.count;
      if (outcome.count > 0) breakdown.push({ title, added: outcome.count });
    }
  });
  // Remember when this sync finished — the top bar's "Synced 4 min ago" —
  // and which channels it couldn't check, so a failure is visible (amber
  // dot) even after the 6-hourly sync nobody watched. A failed channel's
  // videos aren't lost: the next sync looks back 14 days again. Both rows
  // are upserted in one statement.
  const syncedAt = new Date();
  const failed = outcomes.flatMap((o, i) => ("error" in o ? [active[i].title] : []));
  await db
    .insert(appMeta)
    .values([
      { key: LAST_SYNC_KEY, value: syncedAt.toISOString(), updatedAt: syncedAt },
      { key: LAST_SYNC_FAILED_KEY, value: JSON.stringify(failed), updatedAt: syncedAt },
    ])
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
    });
  return {
    channels: active.length,
    added,
    errors,
    failed,
    breakdown,
    syncedAt: syncedAt.toISOString(),
  };
}
