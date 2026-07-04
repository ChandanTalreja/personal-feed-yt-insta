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
