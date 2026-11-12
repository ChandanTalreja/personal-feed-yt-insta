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

/** Your latest track's next video and its place in the track (FEAT-12). */
export interface TrackStep {
  trackId: number;
  trackName: string;
  /** 1-based: "step 4 of 9". */
  step: number;
  count: number;
  video: FeedVideo;
}

/** `/api/videos?continue=1`: started, unfinished videos (+ the Feed's track step). */
export interface ContinueReply {
  videos: FeedVideo[];
  track?: TrackStep | null;
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
  /** Hidden from "All genres" (FEAT-20). */
  hiddenFromAll: boolean;
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

/** A sticky note (FEAT-17), as /api/sticky-notes sends it. */
export interface StickyNoteItem {
  id: number;
  body: string;
  /** yellow, pink, green, blue, peach or lilac. */
  color: string;
  handwritten: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
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
  /** The heading on its handwritten page (FEAT-16), when renamed. */
  handwrittenTitle: string | null;
  createdAt: string;
  updatedAt: string;
}
