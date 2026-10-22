"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./handwritten.css";
import TopBar from "@/components/TopBar";
import Button, { buttonClass } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import PageTitle from "@/components/ui/PageTitle";
import { api } from "@/lib/api-client";
import { sheetsParam, type WrittenSheet } from "@/lib/handwritten/document";
import { resolveStyle } from "@/lib/handwritten/themes";
import { handFontVariables } from "./fonts";
import Paper from "./Paper";
import Tray from "./Tray";
import { useHandwrittenStyle } from "./useHandwrittenStyle";
import { useRoughMarks } from "./useRoughMarks";

/**
 * Handwritten cheat sheets (FEAT-16): the page. The paper on the desk, the
 * choices in a tray beside it, and Save as PDF, which prints only the paper
 * (each sheet from a new A4 page; see handwritten.css).
 */
export default function Studio({ sheets, initialPicked }: { sheets: WrittenSheet[]; initialPicked: number[] }) {
  const [style, setStyle] = useHandwrittenStyle();
  const look = resolveStyle(style);
  const [picked, setPicked] = useState(initialPicked);
  // Headings renamed here, shown at once while they save.
  const [renamed, setRenamed] = useState<Map<number, string>>(new Map());
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const desk = useRef<HTMLDivElement>(null);

  const ids = useMemo(() => sheets.map((s) => s.id), [sheets]);
  const shown = sheets
    .filter((s) => picked.includes(s.id))
    .map((s) => ({ ...s, heading: renamed.get(s.id) ?? s.heading }));
  const questions = shown.reduce((n, s) => n + s.questions.length, 0);

  useRoughMarks(
    desk,
    look.marks,
    look.ink.color,
    look.hand,
    `${picked.join(",")}|${style.paper}|${style.hand}|${shown.map((s) => s.heading).join("|")}`
  );

  // The pick lives in the address, so a link (or a reload) opens the same
  // sheets. Changing it doesn't ask the server for the page again.
  function pick(next: number[]) {
    setPicked(next);
    window.history.replaceState(null, "", `/notebook/handwritten?sheets=${sheetsParam(next, ids)}`);
  }

  async function rename(id: number, typed: string) {
    const sheet = sheets.find((s) => s.id === id);
    if (!sheet) return;
    const before = renamed.get(id) ?? sheet.heading;
    const heading = typed.replace(/\s+/g, " ").trim() || sheet.defaultHeading;
    if (heading === before) return;
    setRenamed((m) => new Map(m).set(id, heading));
    setMessage(null);
    try {
      await api(`/api/cheat-sheets/${id}`, {
        method: "PATCH",
        // The default is stored as nothing, so it follows the topic.
        body: { handwrittenTitle: heading === sheet.defaultHeading ? "" : heading },
        fallback: "Couldn't save the heading",
      });
      // Pages you visit are reused for 5 minutes (PERF-03): refresh this
      // one, so coming back shows the new heading.
      router.refresh();
    } catch (err) {
      setRenamed((m) => new Map(m).set(id, before));
      setMessage((err as Error).message);
    }
  }

  const backTo = `/notebook?sheet=${initialPicked[0] ?? ""}`;

  return (
    <div className={handFontVariables}>
      <div className="print:hidden">
        <TopBar />
      </div>
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-16 sm:px-8 print:max-w-none print:p-0">
        <div className="print:hidden">
          <Link href={backTo} className="-ml-1.5 mb-2 inline-flex rounded-sm px-1.5 py-0.5 text-meta text-muted hover:bg-surface hover:text-ink">
            ← Back to the Notebook
          </Link>
          <PageTitle
            title="Write it by hand"
            note="your sheet, in ink"
            summary={
              shown.length === 0
                ? "No cheat sheets yet"
                : shown.length === 1
                  ? `${shown[0].topic} · ${questions} question${questions === 1 ? "" : "s"}`
                  : `${shown.length} sheets, ${questions} questions. Each sheet starts on a new page.`
            }
          >
            {shown.length > 0 && (
              <Button variant="primary" onClick={() => window.print()}>
                Save as PDF
              </Button>
            )}
          </PageTitle>
          {message && (
            <p role="status" className="mb-5 rounded-md border-[1.5px] border-ink bg-surface px-4 py-2 text-sm font-semibold">
              {message}
            </p>
          )}
        </div>

        {sheets.length === 0 ? (
          <EmptyState
            title="No cheat sheets yet"
            note="ask once, write it out forever"
            action={
              <Link href="/notebook" className={buttonClass("primary")}>
                Open the Notebook
              </Link>
            }
          >
            Make a cheat sheet in the Notebook first: search a topic and ask Gemini to gather its questions. Then it can be written out here.
          </EmptyState>
        ) : (
          <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_312px] print:block">
            <section ref={desk} aria-label="Your pages" className="min-w-0">
              <p className="mb-1.5 flex justify-end print:hidden">
                <span className="pen-note">click the heading to rename it ↘</span>
              </p>
              <div className="grid gap-3.5 print:block">
                {shown.map((sheet, i) => (
                  <Fragment key={sheet.id}>
                    {i > 0 && (
                      <p className="label-caps mx-auto mt-3 flex w-full max-w-[700px] items-center gap-2.5 text-muted before:flex-1 before:border-t before:border-dashed before:border-line after:flex-1 after:border-t after:border-dashed after:border-line print:hidden">
                        new page
                      </p>
                    )}
                    <Paper sheet={sheet} look={look} newPage={i > 0} onRename={rename} />
                  </Fragment>
                ))}
              </div>
            </section>
            <aside aria-label="Choices" className="grid gap-5 lg:sticky lg:top-[81px] print:hidden">
              <Tray sheets={sheets} picked={picked} onPick={pick} style={style} onStyle={setStyle} />
              <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-meta text-muted">
                <span className="font-semibold text-ink">Save as PDF</span> opens the print window: choose
                “Save as PDF” there. Only the paper is saved, each sheet from a new page.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
