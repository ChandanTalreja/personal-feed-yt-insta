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
  search,
  kind,
  lengthFilter,
  view,
  onClearFilters,
  onClearSearch,
  onAnyLength,
  onSeeEverything,
}: {
  hasChannels: boolean;
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
  let body = "Nothing matches these filters.";
  let action: ReactNode = (
    <Button onClick={onClearFilters}>Clear filters</Button>
  );
  if (!hasChannels) {
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
