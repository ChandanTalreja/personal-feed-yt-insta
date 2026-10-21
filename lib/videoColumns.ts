import { sql } from "drizzle-orm";
import { channels, videos } from "./schema";

/**
 * The columns behind a FeedVideo (components/types.ts) — one definition
 * shared by every query that sends videos to the UI (feed, notebook,
 * tracks), so adding a field is a one-place change. Requires the query to
 * join `channels`.
 */
export const feedVideoColumns = {
  id: videos.id,
  ytVideoId: videos.ytVideoId,
  title: videos.title,
  thumbnail: videos.thumbnail,
  durationSeconds: videos.durationSeconds,
  isShort: videos.isShort,
  isLive: videos.isLive,
  publishedAt: videos.publishedAt,
  watched: videos.watched,
  summary: videos.summary,
  laterAt: videos.laterAt,
  watchProgress: videos.watchProgress,
  resumeSeconds: videos.resumeSeconds,
  personalNote: videos.personalNote,
  personalNoteAt: videos.personalNoteAt,
  channelTitle: channels.title,
  channelThumbnail: channels.thumbnail,
  genreId: channels.genreId,
  /** "feed" or "podcasts": which page the video belongs to (FEAT-14). */
  section: channels.section,
  // Saved Ask answers for this video: the small number on the card's Ask
  // button. A per-row count, cheap with the video_notes(video_id) index.
  answerCount: sql<number>`(SELECT count(*)::int FROM video_notes WHERE video_notes.video_id = ${videos.id})`,
  // Tracks this video is in: lights the card's track icon. Same per-row
  // count, cheap with the track_videos(video_id) index.
  trackCount: sql<number>`(SELECT count(*)::int FROM track_videos WHERE track_videos.video_id = ${videos.id})`,
};
