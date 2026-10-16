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
};
