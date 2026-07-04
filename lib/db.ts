import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

// One CREATE TABLE IF NOT EXISTS pass per process. Keeps setup at zero steps:
// Neon in production, embedded PGlite (a real Postgres in a local folder)
// when DATABASE_URL is unset for local development.
const DDL = [
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
  `CREATE TABLE IF NOT EXISTS gemini_usage (
    id serial PRIMARY KEY,
    model text NOT NULL,
    tokens integer,
    used_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE videos ADD COLUMN IF NOT EXISTS transcript text`,
  `ALTER TABLE genres ADD COLUMN IF NOT EXISTS ask_prompt text`,
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

async function init(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    db = drizzleNeon(neon(process.env.DATABASE_URL), { schema });
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    const { mkdir } = await import("fs/promises");
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    await mkdir(dir, { recursive: true });
    const client = new PGlite(dir);
    db = drizzlePglite(client, { schema }) as unknown as Db;
  }
  for (const stmt of DDL) {
    await db.execute(sql.raw(stmt));
  }
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
