import type { ReactNode } from "react";
import Link from "next/link";
import Button, { buttonClass } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import type { View } from "./FeedSidebar";
import type { Kind, LengthFilter } from "./model";

/** What the feed says when the grid is empty — the most specific reason wins. */
export default function FeedEmptyState({
  hasChannels,
  podcasts = false,
  search,
  kind,
  lengthFilter,
  view,
  onClearFilters,
  onClearSearch,
  onAnyLength,
  onSeeEverything,
  didYouMean = null,
  onSearch,
}: {
  /** A search found nothing: the closest spelling in your titles (FEAT-24). */
  didYouMean?: string | null;
  /** Runs a search (the "Did you mean" link). */
  onSearch?: (term: string) => void;
  hasChannels: boolean;
  /** The Podcasts page (FEAT-14): no podcast channels yet means "move one". */
  podcasts?: boolean;
  /** The (debounced) title search. */
  search: string;
  kind: Kind;
  lengthFilter: LengthFilter;
  view: View;
  onClearFilters: () => void;
  onClearSearch: () => void;
  onAnyLength: () => void;
  onSeeEverything: () => void;
}) {
  let title = "Nothing here";
  let note: string | null = null;
  let body: ReactNode = "Nothing matches these filters.";
  let action: ReactNode = (
    <Button onClick={onClearFilters}>Clear filters</Button>
  );
  if (!hasChannels && podcasts) {
    title = "No podcasts yet";
    body = "Move a channel here from the Channels page, or add one and choose Podcasts.";
    action = (
      <Link href="/channels" className={buttonClass("primary")}>
        Open Channels
      </Link>
    );
  } else if (!hasChannels) {
    title = "No channels yet";
    body = "Add a channel and TUBEBOX fetches its last year of uploads.";
    action = (
      <Link href="/channels#add" className={buttonClass("primary")}>
        <Icon name="plus" size={15} />
        Add channel
      </Link>
    );
  } else if (search) {
    title = "No matches";
    body = `Nothing in this view matches “${search}”.`;
    if (didYouMean && onSearch) {
      body = (
        <>
          Nothing in this view matches “{search}”. Did you mean{" "}
          <button
            type="button"
            onClick={() => onSearch(didYouMean)}
            className="font-semibold text-ink underline decoration-primary decoration-[3px] underline-offset-2 hover:decoration-ink"
          >
            {didYouMean}
          </button>
          ?
        </>
      );
    }
    action = <Button onClick={onClearSearch}>Clear search</Button>;
  } else if (kind === "videos" && lengthFilter !== "any") {
    title = "Nothing that length here";
    body = "Try another length, or any length.";
    action = <Button onClick={onAnyLength}>Any length</Button>;
  } else if (view === "later") {
    title = "Nothing saved for later";
    body = "Use the bookmark on any card. Watched videos leave this list on their own.";
    action = null;
  } else if (view === "unwatched") {
    title = "You're all caught up";
    note = "nothing new. go outside?";
    body = "Nothing unseen in this view.";
    action = <Button onClick={onSeeEverything}>See everything</Button>;
  } else if (view === "picked") {
    title = "Nothing picked yet";
    body = "On the Channels page, switch the add bar to Pick and tick the videos you want from a channel.";
    action = (
      <Link href="/channels#add" className={buttonClass("primary")}>
        Open Channels
      </Link>
    );
  } else if (view === "paper") {
    title = "Nothing on paper yet";
    body = "Summarise a video or open its transcript, and it lands here.";
    action = null;
  } else if (view === "watched") {
    title = "Nothing watched yet";
    body = "Videos you tick, or watch past halfway, land here.";
    action = null;
  }
  return (
    <EmptyState title={title} note={note} action={action}>
      {body}
    </EmptyState>
  );
}
