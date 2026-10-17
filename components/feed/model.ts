import type { View } from "./FeedSidebar";
import type { StudyTab } from "./StudyPanel";
import type { FeedVideo } from "@/components/types";

export type Kind = "videos" | "shorts";
export type LengthFilter = "any" | "short" | "medium" | "long";

export const PAGE_SIZE = 24;

export const VIEW_TITLES: Record<View, string> = {
  unwatched: "Inbox",
  later: "Watch later",
  watched: "Watched",
  all: "Everything",
};

/** The blue pen note beside the title (REF-07): what makes the page different. */
export const VIEW_NOTES: Record<View, string | undefined> = {
  unwatched: "newest first, no algorithm",
  later: "saved for a slower day",
  watched: "seen it, kept it",
  all: undefined,
};

export interface FeedChannel {
  id: number;
  title: string;
  thumbnail: string | null;
  genreId: number | null;
  isActive: boolean;
  videoCount: number;
  shortCount: number;
}

/** What the study panel is showing: which video, which tab, track chooser open? */
export interface Study {
  video: FeedVideo;
  tab: StudyTab;
  track: boolean;
}
