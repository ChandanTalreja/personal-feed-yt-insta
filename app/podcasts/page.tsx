import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadFirstScreen } from "@/lib/firstScreen";
import FeedClient from "@/components/feed/FeedClient";
import FeedSkeleton from "@/components/feed/FeedSkeleton";

export const dynamic = "force-dynamic";

/** Podcasts (FEAT-14): the Feed's screen, over podcast channels only. */
export default async function Podcasts() {
  if (!(await isAuthed())) redirect("/login");
  // PERF-10: the frame first, the episodes when ready (see app/page.tsx).
  return (
    <Suspense fallback={<FeedSkeleton section="podcasts" />}>
      <PodcastsFeed />
    </Suspense>
  );
}

async function PodcastsFeed() {
  // Audit B1: the first screen comes inside the page (see app/page.tsx).
  const first = await getDb()
    .then((db) => loadFirstScreen(db, "podcasts"))
    .catch((err) => {
      console.error(`[first-screen] podcasts failed, the screen will fetch it: ${(err as Error).message.split("\n")[0]}`);
      return null;
    });
  return <FeedClient section="podcasts" first={first} />;
}
