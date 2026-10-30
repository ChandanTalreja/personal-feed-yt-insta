"use client";

import TopBar from "@/components/TopBar";
import PageTitle from "@/components/ui/PageTitle";
import FeedSidebar from "./FeedSidebar";
import Greeting from "./Greeting";
import { VideoCardSkeleton } from "./VideoCard";
import { VIDEO_GRID, VIEW_NOTES, VIEW_TITLES } from "./model";

const nothing = () => {};

/**
 * What the Feed and Podcasts pages show while their first screen is being
 * gathered (PERF-10). On a cold open that's the database waking up and the
 * queries, about 2.5 s: instead of a blank tab, the page's frame arrives
 * first (the top bar, the real sidebar with no counts yet, the greeting and
 * the title) with placeholder cards, laid out exactly like the page, so
 * nothing moves when the cards come. The top bar is quiet: it doesn't ask
 * for its counts, which would wake a second Netlify instance.
 */
export default function FeedSkeleton({
  section = "feed",
  ownerName,
}: {
  section?: "feed" | "podcasts";
  ownerName?: string;
}) {
  const podcasts = section === "podcasts";
  return (
    <>
      <TopBar flush quiet />
      <div className="flex items-start" aria-busy="true">
        <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-[236px] shrink-0 overflow-y-auto border-r border-line py-5 lg:block">
          <FeedSidebar
            view="unwatched"
            onView={nothing}
            genres={[]}
            genreId={null}
            onGenre={nothing}
            channels={[]}
            channelIds={[]}
            onToggleChannel={nothing}
            onClearChannels={nothing}
            facets={null}
            podcasts={podcasts}
            onNotes={podcasts ? undefined : nothing}
            loading
          />
        </aside>
        <main className="@container min-w-0 flex-1 px-4 pb-16 pt-8 sm:px-8 xl:px-10">
          {!podcasts && <Greeting name={ownerName} />}
          <PageTitle
            title={podcasts ? "Podcasts" : VIEW_TITLES.unwatched}
            note={podcasts ? "long listens, at your pace" : VIEW_NOTES.unwatched}
            summary={<span className="inline-block h-4 w-64 max-w-full animate-pulse rounded-xs bg-line align-middle" />}
          >
            {/* The controls' places (Filters, the list filter, Videos/Shorts,
                the lengths), so the cards don't drop when they arrive. */}
            <span className="h-9 w-[74px] animate-pulse rounded-md bg-line lg:hidden" />
            <span className="h-9 w-full animate-pulse rounded-md bg-line sm:w-56" />
            {!podcasts && <span className="h-9 w-[132px] animate-pulse rounded-md bg-line" />}
            <span className="h-9 w-[240px] animate-pulse rounded-md bg-line" />
          </PageTitle>
          <div className={VIDEO_GRID}>
            {Array.from({ length: 8 }, (_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
