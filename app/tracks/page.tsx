import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import TracksClient from "@/components/TracksClient";

export const dynamic = "force-dynamic";

export default async function TracksPage() {
  if (!(await isAuthed())) redirect("/login");
  return <TracksClient />;
}
