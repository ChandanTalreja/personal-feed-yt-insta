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
  addedAt: string;
}
