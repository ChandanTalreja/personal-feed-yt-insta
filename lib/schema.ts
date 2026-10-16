import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const genres = pgTable("genres", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#FFC900"),
  // Optional suggested question shown as the single preset chip in the Ask
  // panel of this genre's videos (e.g. Interview -> "List all the questions
  // asked in this video"). Null = no suggestion, just the free-text box.
  askPrompt: text("ask_prompt"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  ytChannelId: text("yt_channel_id").notNull().unique(),
  handle: text("handle"),
  title: text("title").notNull(),
  thumbnail: text("thumbnail"),
  uploadsPlaylistId: text("uploads_playlist_id").notNull(),
  genreId: integer("genre_id").references(() => genres.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  ytVideoId: text("yt_video_id").notNull().unique(),
  channelId: integer("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  thumbnail: text("thumbnail"),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  isShort: boolean("is_short").notNull().default(false),
  isLive: boolean("is_live").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  watched: boolean("watched").notNull().default(false),
  summary: text("summary"),
  transcript: text("transcript"),
  // Watch Later: null = not saved; a timestamp = saved at that moment (also
  // the LATER tab's sort key, newest first). Cleared when marked watched.
  laterAt: timestamp("later_at", { withTimezone: true }),
  // Honest watched: a map of played 10-second chunks (see lib/progress.ts)
  // and the second to resume from. Both null until first played.
  watchProgress: text("watch_progress"),
  resumeSeconds: integer("resume_seconds"),
  /** When it was last actually played (set by every progress save). Feeds
   *  a track's "last watched yesterday"; a hand-ticked ✓ doesn't count. */
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  // Your own note on this video (one per video; null = none). Separate
  // from video_notes, which holds Gemini's saved Ask answers.
  personalNote: text("personal_note"),
  personalNoteAt: timestamp("personal_note_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Saved answers from the per-video "Ask Gemini" feature.
export const videoNotes = pgTable("video_notes", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  model: text("model"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Failed login attempts per IP — shared state for rate limiting, since
// serverless instances share no memory (the DB is the only common ground).
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per Gemini API call — the app's own usage ledger, since Google's
// API doesn't expose remaining quota. The model picker reads today's counts.
export const geminiUsage = pgTable("gemini_usage", {
  id: serial("id").primaryKey(),
  model: text("model").notNull(),
  tokens: integer("tokens"),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
});

// Small app-wide values, one row per key (e.g. "last_sync_at"). A key/value
// table so future settings don't each need a table of their own.
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Learning tracks: named, ordered collections of videos to work through.
export const tracks = pgTable("tracks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Which videos are in which track, and in what order. The (track, video)
// key makes adding idempotent; deleting a track or a video cascades here.
export const trackVideos = pgTable(
  "track_videos",
  {
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.videoId] })]
);

export type Genre = typeof genres.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
