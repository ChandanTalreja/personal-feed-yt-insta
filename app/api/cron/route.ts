import { NextRequest, NextResponse } from "next/server";
import { DB_TIMEOUT_MESSAGE, getDb, isDbTimeout } from "@/lib/db";
import { isAuthed, unauthorized } from "@/lib/auth";
import { syncAllChannels } from "@/lib/ingest";

export const maxDuration = 60;

/**
 * Triggered every 6 hours by the Netlify scheduled function (with the
 * CRON_SECRET header), or manually from the UI (with the auth cookie).
 * Only one sync runs at a time: see syncAllChannels (FIX-12). The scheduled
 * run also skips when a sync just finished (FIX-13); Sync now always runs.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Header only: a secret in the URL (?secret=) ends up in logs and
  // browser history. The scheduled function already sends the header.
  const provided = req.headers.get("x-cron-secret");
  // The secret header is how the scheduled function calls; the button
  // comes with the auth cookie.
  const scheduled = Boolean(secret && provided === secret);
  const authorized = scheduled || (await isAuthed());
  if (!authorized) return unauthorized();
  try {
    const db = await getDb();
    const result = await syncAllChannels(db, { scheduled });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      // The driver wraps a timeout in its own words: show only ours.
      { error: isDbTimeout(err) ? DB_TIMEOUT_MESSAGE : (err as Error).message },
      { status: 500 }
    );
  }
}
