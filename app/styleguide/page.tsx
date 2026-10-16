import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import StyleguideClient from "@/components/StyleguideClient";

export const dynamic = "force-dynamic";

/** Redesign reference: tokens and building blocks (docs/REDESIGN.md). */
export default async function StyleguidePage() {
  if (!(await isAuthed())) redirect("/login");
  return <StyleguideClient />;
}
