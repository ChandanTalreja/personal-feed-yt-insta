import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { refreshAllChannels } from "@/lib/ingest";

export const maxDuration = 60;

/**
 * Triggered every 6 hours by the Netlify scheduled function (with the
 * CRON_SECRET header), or manually from the UI (with the auth cookie).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  const authorized = (secret && provided === secret) || (await isAuthed());
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = await getDb();
    const result = await refreshAllChannels(db);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
