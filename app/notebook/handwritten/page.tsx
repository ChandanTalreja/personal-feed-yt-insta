import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { listCheatSheets } from "@/lib/cheatSheets";
import { getDb } from "@/lib/db";
import { pickSheets, toWrittenSheet } from "@/lib/handwritten/document";
import Studio from "@/components/handwritten/Studio";

export const dynamic = "force-dynamic";

/**
 * /notebook/handwritten?sheets=7,3,1 (or ?sheets=all): your cheat sheets
 * written out by hand, to save as a PDF (FEAT-16). The sheets come with the
 * page, in the Notebook's order.
 */
export default async function HandwrittenPage({
  searchParams,
}: {
  searchParams: Promise<{ sheets?: string | string[] }>;
}) {
  if (!(await isAuthed())) redirect("/login");
  const sheets = (await listCheatSheets(await getDb())).map(toWrittenSheet);
  const raw = (await searchParams).sheets;
  const picked = pickSheets(Array.isArray(raw) ? raw[0] : raw, sheets.map((s) => s.id));
  return <Studio sheets={sheets} initialPicked={picked} />;
}
