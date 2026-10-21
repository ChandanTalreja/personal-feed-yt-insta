import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import FeedClient from "@/components/feed/FeedClient";

export const dynamic = "force-dynamic";

/** Podcasts (FEAT-14): the Feed's screen, over podcast channels only. */
export default async function Podcasts() {
  if (!(await isAuthed())) redirect("/login");
  return <FeedClient section="podcasts" />;
}
