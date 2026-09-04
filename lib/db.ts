import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
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
  `CREATE INDEX IF NOT EXISTS videos_title_trgm_idx ON videos USING gin (title gin_trgm_ops)`,
  `CREATE TABLE IF NOT EXISTS gemini_usage (
    id serial PRIMARY KEY,
    model text NOT NULL,
    tokens integer,
    used_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS transcript text`,
  `ALTER TABLE genres ADD COLUMN IF NOT EXISTS ask_prompt text`,
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
];

// Short random tag for this server process. On Netlify the app runs on AWS
// Lambda, where each instance is its own process and serves one request at
// a time — so two requests that arrive together can be handled by two
// instances, and each runs init() once. The tag makes that visible in the
// function logs: one "[db abc123] cold init" line per instance.
const INSTANCE = Math.random().toString(36).slice(2, 8);

// The Neon driver talks over HTTP: every statement is its own request, and a
// Netlify → Neon round trip costs ~200–300 ms. Running the DDL list one
// statement at a time therefore cost ~3 s on every cold start. Wrapping the
// whole list in one anonymous code block (DO $$ … $$) sends it as a single
// statement, so the entire schema check is one round trip. Each statement is
// still IF NOT EXISTS, so the block is safe to run on every cold start.
function schemaSetupBlock(): string {
  return `DO $$ BEGIN\n${DDL.join(";\n")};\nEND $$`;
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
  await db.execute(sql.raw(schemaSetupBlock()));
  const t2 = performance.now();
  // Timing breakdown for the cold-start cost. On Neon, "schema" is one round
  // trip when the compute is awake and round trip + wake-up when it was
  // suspended (Neon free tier pauses after 5 idle minutes), so a number well
  // above ~500 ms means the wake-up, not the DDL.
  console.log(
    `[db ${INSTANCE}] cold init (${mode}): driver ${Math.round(t1 - t0)}ms, ` +
      `schema ${Math.round(t2 - t1)}ms (${DDL.length} statements, 1 round trip), ` +
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
