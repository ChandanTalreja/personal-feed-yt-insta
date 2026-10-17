import type { FeedVideo } from "@/components/types";
import { formatTotalTime, timeAgo } from "@/lib/format";

export interface TrackSummary {
  id: number;
  name: string;
  createdAt: string;
  count: number;
  watchedCount: number;
  totalSeconds: number;
  remainingSeconds: number;
  nextVideoId: number | null;
  lastPlayedAt: string | null;
  genreId: number | null;
}

export type TrackVideo = FeedVideo & { position: number };

export interface TrackDetail {
  track: { id: number; name: string };
  videos: TrackVideo[];
}

/** "today", "yesterday", "3d ago", "2w ago". */
function lastWatchedLabel(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(then.toDateString()).getTime()) / 86_400_000
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return timeAgo(iso);
}

/** The line under a track's name: what's left and when you were last here. */
export function trackLine(t: TrackSummary): string {
  if (t.count === 0) return "Empty: add videos from the feed";
  const left = t.watchedCount === t.count ? "All watched ✓" : `${formatTotalTime(t.remainingSeconds)} left`;
  return t.lastPlayedAt ? `${left} · last watched ${lastWatchedLabel(t.lastPlayedAt)}` : left;
}
