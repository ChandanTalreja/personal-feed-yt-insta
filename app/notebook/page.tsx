import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import NotebookClient from "@/components/notebook/NotebookClient";

export const dynamic = "force-dynamic";

export default async function NotebookPage() {
  if (!(await isAuthed())) redirect("/login");
  return <NotebookClient />;
}
