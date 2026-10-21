export interface FeedVideo {
  id: number;
  ytVideoId: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number;
  isShort: boolean;
  isLive: boolean;
  publishedAt: string;
  watched: boolean;
  summary: string | null;
  /** When it was saved to Watch Later; null = not saved. */
  laterAt: string | null;
  /** Played 10-second chunks ("1" = played); see lib/progress.ts. */
  watchProgress: string | null;
  /** Second to resume playback from; null = start at the beginning. */
  resumeSeconds: number | null;
  /** Your own note on this video; null = none. */
  personalNote: string | null;
  personalNoteAt: string | null;
  channelTitle: string;
  channelThumbnail: string | null;
  genreId: number | null;
  /** Saved Ask answers for this video. */
  answerCount: number;
  /** Tracks this video is in. */
  trackCount: number;
  /** "feed" or "podcasts": its channel's home (FEAT-14). */
  section: string;
}

/** A saved Ask answer (a row of video_notes). */
export interface Answer {
  id: number;
  videoId: number;
  prompt: string;
  answer: string;
  createdAt: string;
}

export interface GenreItem {
  id: number;
  name: string;
  color: string;
  askPrompt: string | null;
}

export interface ChannelItem {
  id: number;
  ytChannelId: string;
  handle: string | null;
  title: string;
  thumbnail: string | null;
  genreId: number | null;
  isActive: boolean;
  /** "feed" or "podcasts" (FEAT-14). */
  section: string;
  addedAt: string;
}

/** A saved cheat sheet (FEAT-15), as the API sends it. */
export interface CheatSheetItem {
  id: number;
  query: string;
  queryKey: string;
  /** The Notebook's genre choice it was made with: "all", "none" or a genre id. */
  genreKey: string;
  questions: { question: string; answer: string | null; videoIds: number[] }[];
  lineCount: number;
  videoCount: number;
  linesHash: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}
