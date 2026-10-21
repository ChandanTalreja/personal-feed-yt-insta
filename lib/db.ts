import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

// One CREATE TABLE IF NOT EXISTS pass per process. Keeps setup at zero steps:
// Neon in production, embedded PGlite (a real Postgres in a local folder)
// when DATABASE_URL is unset for local development.
const DDL = [
  // Fuzzy (typo-tolerant) title search. Neon has pg_trgm built in; PGlite
  // gets it via the contrib module wired into the client below.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE TABLE IF NOT EXISTS genres (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    color text NOT NULL DEFAULT '#FFC900',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS channels (
    id serial PRIMARY KEY,
    yt_channel_id text NOT NULL UNIQUE,
    handle text,
    title text NOT NULL,
    thumbnail text,
    uploads_playlist_id text NOT NULL,
    genre_id integer REFERENCES genres(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    added_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS videos (
    id serial PRIMARY KEY,
    yt_video_id text NOT NULL UNIQUE,
    channel_id integer NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title text NOT NULL,
    thumbnail text,
    duration_seconds integer NOT NULL DEFAULT 0,
    is_short boolean NOT NULL DEFAULT false,
    is_live boolean NOT NULL DEFAULT false,
    published_at timestamptz NOT NULL,
    watched boolean NOT NULL DEFAULT false,
    summary text,
    fetched_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS videos_published_idx ON videos (published_at DESC)`,
  // One channel's videos, newest first (channel filter, per-channel counts):
  // an index scan instead of reading every video.
  `CREATE INDEX IF NOT EXISTS videos_channel_published_idx ON videos (channel_id, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS videos_title_trgm_idx ON videos USING gin (title gin_trgm_ops)`,
  `CREATE TABLE IF NOT EXISTS gemini_usage (
    id serial PRIMARY KEY,
    model text NOT NULL,
    tokens integer,
    used_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS transcript text`,
  `ALTER TABLE genres ADD COLUMN IF NOT EXISTS ask_prompt text`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS later_at timestamptz`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS watch_progress text`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS resume_seconds integer`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS personal_note text`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS personal_note_at timestamptz`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS last_played_at timestamptz`,
  // Partial index: only the handful of saved videos are indexed, so the
  // LATER tab and its counts stay instant however big the archive grows.
  `CREATE INDEX IF NOT EXISTS videos_later_idx ON videos (later_at DESC) WHERE later_at IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id serial PRIMARY KEY,
    ip text NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, attempted_at)`,
  `CREATE TABLE IF NOT EXISTS video_notes (
    id serial PRIMARY KEY,
    video_id integer NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    prompt text NOT NULL,
    answer text NOT NULL,
    model text,
    source text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tracks (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS track_videos (
    track_id integer NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    video_id integer NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    position integer NOT NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (track_id, video_id)
  )`,
  `CREATE INDEX IF NOT EXISTS track_videos_video_idx ON track_videos (video_id)`,
  // Answer counts on every feed card look up notes by video.
  `CREATE INDEX IF NOT EXISTS video_notes_video_idx ON video_notes (video_id)`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Cheat sheets (FEAT-15). A new table changes the schema fingerprint, so
  // the first cold start after deploying runs this list once (PERF-05).
  `CREATE TABLE IF NOT EXISTS cheat_sheets (
    id serial PRIMARY KEY,
    query text NOT NULL,
    query_key text NOT NULL,
    genre_key text NOT NULL,
    questions jsonb NOT NULL,
    line_count integer NOT NULL,
    video_count integer NOT NULL,
    lines_hash text NOT NULL,
    model text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cheat_sheets_key_idx ON cheat_sheets (query_key, genre_key)`,
  // Podcasts (FEAT-14): a channel's home, and a video's chapters.
  `ALTER TABLE channels ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'feed'`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS chapters jsonb`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS chapters_source text`,
];

// Short random tag for this server process. On Netlify the app runs on AWS
// Lambda, where each instance is its own process and serves one request at
// a time — so two requests that arrive together can be handled by two
// instances, and each runs init() once. The tag makes that visible in the
// function logs: one "[db abc123] cold init" line per instance.
const INSTANCE = Math.random().toString(36).slice(2, 8);

// Arbitrary constant; it only has to be the same in every instance of this
// app so that they all queue on the same advisory lock.
const SCHEMA_LOCK_KEY = 7_201_314;

// The Neon driver talks over HTTP: every statement is its own request, and a
// Netlify → Neon round trip costs ~200–300 ms. Running the DDL list one
// statement at a time therefore cost ~3 s on every cold start. Wrapping the
// whole list in one anonymous code block (DO $$ … $$) sends it as a single
// statement, so the entire schema check is one round trip. Each statement is
// still IF NOT EXISTS, so the block is safe to run on every cold start.
//
// The block is also ONE transaction, so every lock it takes is held until
// END. Two instances cold-starting together (Lambda serves one request per
// instance, so a page that fires two fetches can spawn two) each took a
// ShareLock on `videos` at CREATE INDEX IF NOT EXISTS, then both asked for
// the AccessExclusiveLock that ALTER TABLE needs — each waiting on the
// other's ShareLock: a deadlock (seen in production, SQLSTATE 40P01). The
// advisory lock on line one makes the second instance wait there, holding
// nothing, until the first commits; it is released automatically at END.
//
// After taking the lock it checks the version stamp again: when several
// instances cold-start right after a schema change, the first one runs the
// list and stamps it, and the ones queued behind it skip straight to END.
// (The nested IF matters: PL/pgSQL plans a statement only when it reaches
// it, so on a brand-new database the app_meta SELECT is never planned.)
function schemaSetupBlock(): string {
  return [
    "DO $$ BEGIN",
    `PERFORM pg_advisory_xact_lock(${SCHEMA_LOCK_KEY});`,
    "IF to_regclass('app_meta') IS NOT NULL THEN",
    `  IF EXISTS (SELECT 1 FROM app_meta WHERE key = '${SCHEMA_VERSION_KEY}' AND value = '${SCHEMA_VERSION}') THEN RETURN; END IF;`,
    "END IF;",
    `${DDL.join(";\n")};`,
    `INSERT INTO app_meta (key, value) VALUES ('${SCHEMA_VERSION_KEY}', '${SCHEMA_VERSION}')`,
    "  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();",
    "END $$",
  ].join("\n");
}

// The schema rarely changes, yet every cold instance used to run the whole
// list above, queuing on the advisory lock behind the others (6 instances
// that cold-started together after a deploy lost ~1 s each). Now the list
// is stamped with a fingerprint of its own text in app_meta, and a cold
// instance first does one plain read of that stamp: if it matches, the
// schema is already current, so there is no lock, no queue and no DDL.
// Any edit to DDL changes the fingerprint by itself, so the next cold
// instance runs the list once and re-stamps it.
const SCHEMA_VERSION_KEY = "schema_version";
const SCHEMA_VERSION = createHash("sha256")
  .update(DDL.join(";"))
  .digest("hex")
  .slice(0, 12);

async function schemaIsCurrent(db: Db): Promise<boolean> {
  try {
    const rows = await db
      .select({ value: schema.appMeta.value })
      .from(schema.appMeta)
      .where(eq(schema.appMeta.key, SCHEMA_VERSION_KEY));
    return rows[0]?.value === SCHEMA_VERSION;
  } catch {
    // Brand-new database (no app_meta table yet). If the database is
    // unreachable instead, the full setup below throws the real error.
    return false;
  }
}

async function init(): Promise<Db> {
  const t0 = performance.now();
  let db: Db;
  let mode: string;
  if (process.env.DATABASE_URL) {
    mode = "neon";
    db = drizzleNeon(neon(process.env.DATABASE_URL), { schema });
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    const { mkdir } = await import("fs/promises");
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    mode = `pglite ${dir}`;
    await mkdir(dir, { recursive: true });
    // pg_trgm must be registered on the PGlite client (Neon ships it
    // natively); the CREATE EXTENSION in DDL then activates it.
    const client = new PGlite(dir, { extensions: { pg_trgm } });
    db = drizzlePglite(client, { schema }) as unknown as Db;
  }
  const t1 = performance.now();
  const current = await schemaIsCurrent(db);
  if (!current) await db.execute(sql.raw(schemaSetupBlock()));
  const t2 = performance.now();
  // Timing breakdown for the cold-start cost. On Neon, "schema" is one round
  // trip when the compute is awake and round trip + wake-up when it was
  // suspended (Neon free tier pauses after 5 idle minutes), so a number well
  // above ~500 ms means the wake-up, not the DDL.
  console.log(
    `[db ${INSTANCE}] cold init (${mode}): driver ${Math.round(t1 - t0)}ms, ` +
      (current
        ? `schema ${Math.round(t2 - t1)}ms (skipped, version ${SCHEMA_VERSION} is current), `
        : `schema ${Math.round(t2 - t1)}ms (${DDL.length} statements, version ${SCHEMA_VERSION}), `) +
      `total ${Math.round(t2 - t0)}ms`
  );
  return db;
}

const g = globalThis as unknown as { __pfDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__pfDb ??= init().catch((err) => {
    // Don't cache a failed init; let the next request retry.
    g.__pfDb = undefined;
    throw err;
  });
  return g.__pfDb;
}
