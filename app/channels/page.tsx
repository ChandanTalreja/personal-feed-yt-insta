import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import ChannelsClient from "@/components/channels/ChannelsClient";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  if (!(await isAuthed())) redirect("/login");
  return <ChannelsClient />;
}
