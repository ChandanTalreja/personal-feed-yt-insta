import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadFirstScreen } from "@/lib/firstScreen";
import FeedClient from "@/components/feed/FeedClient";
import FeedSkeleton from "@/components/feed/FeedSkeleton";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isAuthed())) redirect("/login");
  const ownerName = process.env.OWNER_NAME?.trim() || undefined;
  // PERF-10: the page's frame and placeholder cards go out at once, and the
  // feed streams into the same response when its data is ready. A Suspense
  // here rather than a loading.tsx, so it covers this page only and the
  // login check above still answers with a plain redirect.
  return (
    <Suspense fallback={<FeedSkeleton ownerName={ownerName} />}>
      <Feed ownerName={ownerName} />
    </Suspense>
  );
}

async function Feed({ ownerName }: { ownerName?: string }) {
  // Audit B1: the first screen comes inside the page. If gathering it fails,
  // the page still opens and the screen fetches its data as before.
  const first = await getDb()
    .then((db) => loadFirstScreen(db, "feed"))
    .catch((err) => {
      console.error(`[first-screen] feed failed, the screen will fetch it: ${(err as Error).message.split("\n")[0]}`);
      return null;
    });
  return <FeedClient first={first} ownerName={ownerName} />;
}
