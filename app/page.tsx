import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import FeedClient from "@/components/FeedClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isAuthed())) redirect("/login");
  return <FeedClient />;
}
