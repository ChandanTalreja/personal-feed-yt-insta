import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { denyUnlessAuthed } from "@/lib/auth";
import { channels, videos } from "@/lib/schema";
import { feedVideoColumns } from "@/lib/videoColumns";
import {
  WATCHED_THRESHOLD,
  coveredRatio,
  isValidProgress,
  mergeProgress,
} from "@/lib/progress";
import { badId, parseId } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/** Generous for a study note, small enough that a runaway paste can't bloat the row. */
const MAX_NOTE_CHARS = 20_000;

/** GET /api/videos/:id — one video in the feed's shape (global search opens it in the study panel). */
export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const db = await getDb();
  const [video] = await db
    .select(feedVideoColumns)
    .from(videos)
    .innerJoin(channels, eq(videos.channelId, channels.id))
    .where(eq(videos.id, id));
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  return NextResponse.json({ video });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await denyUnlessAuthed();
  if (denied) return denied;
  const id = parseId((await params).id);
  if (id == null) return badId();
  const videoId = id;
  const body = await req.json();
  const updates: Partial<typeof videos.$inferInsert> = {};
  if ("later" in body) {
    updates.laterAt = body.later ? new Date() : null;
  }
  if ("watched" in body) {
    updates.watched = !!body.watched;
    // Watch Later is a to-do list: once watched, the video leaves it.
    if (body.watched) updates.laterAt = null;
  }
  if ("personalNote" in body) {
    if (typeof body.personalNote !== "string") {
      return NextResponse.json(
        { error: "personalNote must be text" },
        { status: 400 }
      );
    }
    const note = body.personalNote.trim();
    if (note.length > MAX_NOTE_CHARS) {
      return NextResponse.json(
        { error: `Notes are limited to ${MAX_NOTE_CHARS} characters.` },
        { status: 400 }
      );
    }
    // Clearing the text deletes the note.
    updates.personalNote = note || null;
    updates.personalNoteAt = note ? new Date() : null;
  }
  if ("resumeSeconds" in body) {
    const r = Number(body.resumeSeconds);
    if (Number.isFinite(r) && r >= 0) updates.resumeSeconds = Math.floor(r);
  }
  const hasProgress = "progress" in body;
  if (hasProgress && !isValidProgress(body.progress)) {
    return NextResponse.json(
      { error: "progress must be a string of 0s and 1s" },
      { status: 400 }
    );
  }
  if (!hasProgress && Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = await getDb();

  if (hasProgress) {
    const [current] = await db
      .select({
        durationSeconds: videos.durationSeconds,
        watchProgress: videos.watchProgress,
        watched: videos.watched,
      })
      .from(videos)
      .where(eq(videos.id, videoId));
    if (!current) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    // OR-merge with what's saved: sittings add up, nothing is ever lost.
    const merged = mergeProgress(current.watchProgress, body.progress);
    updates.watchProgress = merged;
    // A progress save means it's being played right now — the tracks page's
    // "last watched". Same UPDATE, so it costs nothing extra.
    updates.lastPlayedAt = new Date();
    // Auto-mark only when coverage CROSSES the threshold on this save, so a
    // video you un-marked by hand isn't silently re-marked by later saves.
    const before = coveredRatio(current.watchProgress, current.durationSeconds);
    const after = coveredRatio(merged, current.durationSeconds);
    if (
      !("watched" in body) &&
      !current.watched &&
      before < WATCHED_THRESHOLD &&
      after >= WATCHED_THRESHOLD
    ) {
      updates.watched = true;
      updates.laterAt = null;
    }
  }

  // Return only what the UI needs — never the (possibly huge) transcript,
  // since progress saves happen every few seconds while a video plays.
  const [updated] = await db
    .update(videos)
    .set(updates)
    .where(eq(videos.id, videoId))
    .returning({
      id: videos.id,
      watched: videos.watched,
      laterAt: videos.laterAt,
      watchProgress: videos.watchProgress,
      resumeSeconds: videos.resumeSeconds,
      personalNote: videos.personalNote,
      personalNoteAt: videos.personalNoteAt,
    });
  if (!updated) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  return NextResponse.json({ video: updated });
}
