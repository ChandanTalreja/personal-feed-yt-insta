import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadFirstScreen } from "@/lib/firstScreen";
import FeedClient from "@/components/feed/FeedClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isAuthed())) redirect("/login");
  // Audit B1: the first screen comes inside the page. If gathering it fails,
  // the page still opens and the screen fetches its data as before.
  const first = await getDb()
    .then((db) => loadFirstScreen(db, "feed"))
    .catch(() => null);
  return <FeedClient first={first} />;
}
