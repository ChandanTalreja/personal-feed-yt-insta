import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadFirstScreen } from "@/lib/firstScreen";
import FeedClient from "@/components/feed/FeedClient";

export const dynamic = "force-dynamic";

/** Podcasts (FEAT-14): the Feed's screen, over podcast channels only. */
export default async function Podcasts() {
  if (!(await isAuthed())) redirect("/login");
  // Audit B1: the first screen comes inside the page (see app/page.tsx).
  const first = await getDb()
    .then((db) => loadFirstScreen(db, "podcasts"))
    .catch(() => null);
  return <FeedClient section="podcasts" first={first} />;
}
