import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
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

// One row per Gemini API call — the app's own usage ledger, since Google's
// API doesn't expose remaining quota. The model picker reads today's counts.
export const geminiUsage = pgTable("gemini_usage", {
  id: serial("id").primaryKey(),
  model: text("model").notNull(),
  tokens: integer("tokens"),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Genre = typeof genres.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
