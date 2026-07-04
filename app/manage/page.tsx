import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import ManageClient from "@/components/ManageClient";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  if (!(await isAuthed())) redirect("/login");
  return <ManageClient />;
}
