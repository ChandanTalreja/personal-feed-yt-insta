"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./handwritten.css";
import TopBar from "@/components/TopBar";
import Button, { buttonClass } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import PageTitle from "@/components/ui/PageTitle";
import { api } from "@/lib/api-client";
import { sheetsParam, type WrittenSheet } from "@/lib/handwritten/document";
import { A4_WIDTH_PX, paginate } from "@/lib/handwritten/pages";
import { resolveStyle } from "@/lib/handwritten/themes";
import { handFontVariables } from "./fonts";
import Paper, { BlockView, blockKey, lookVars, sheetBlocks, type PageModel } from "./Paper";
import Tray from "./Tray";
import { useHandwrittenStyle } from "./useHandwrittenStyle";
import { useRoughMarks } from "./useRoughMarks";

/**
 * Handwritten cheat sheets (FEAT-16): the page. The paper on the desk, the
 * choices in a tray beside it, and Save as PDF, which prints only the paper.
 * The paper is real A4 pages (REF-19): each sheet is written out once, out of
 * sight, at A4 size; its blocks are measured and cut into pages
 * (lib/handwritten/pages.ts); each page prints as one PDF page, so the screen
 * and the PDF break in the same places.
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
  const measure = useRef<HTMLDivElement>(null);
  // For each shown sheet, its pages as block indexes (and whether a page is
  // one block taller than a page, which then grows); null until measured.
  const [breaks, setBreaks] = useState<{ blocks: number[]; tall: boolean }[][] | null>(null);
  // Pages shrink to fit a narrow screen, like a PDF viewer; 1 = true size.
  const [scale, setScale] = useState(1);

  const ids = useMemo(() => sheets.map((s) => s.id), [sheets]);
  const shown = sheets
    .filter((s) => picked.includes(s.id))
    .map((s) => ({ ...s, heading: renamed.get(s.id) ?? s.heading }));
  const questions = shown.reduce((n, s) => n + s.questions.length, 0);
  const layoutKey = `${picked.join(",")}|${style.paper}|${style.hand}|${shown.map((s) => s.heading).join("|")}`;

  // Cut into pages from the measuring copy: before the first paint, and
  // again once the hand's font has loaded (its words are wider or narrower).
  useLayoutEffect(() => {
    const cut = () => {
      const root = measure.current;
      if (!root) return;
      const next = [...root.querySelectorAll<HTMLElement>(".hw-paper")].map((paper) => {
        const box = getComputedStyle(paper);
        // The whole page less its margins: printed, it has no border.
        const room = paper.getBoundingClientRect().height - parseFloat(box.paddingTop) - parseFloat(box.paddingBottom);
        const sizes = [...paper.querySelectorAll<HTMLElement>("[data-block]")].map((el) => ({
          height: el.offsetHeight,
          after: parseFloat(getComputedStyle(el).marginBottom) || 0,
        }));
        return paginate(sizes, room).map((blocks) => ({
          blocks,
          tall: blocks.length === 1 && sizes[blocks[0]].height > room + 0.5,
        }));
      });
      setBreaks((before) => (JSON.stringify(before) === JSON.stringify(next) ? before : next));
    };
    cut();
    let live = true;
    document.fonts?.ready.then(() => live && cut());
    return () => {
      live = false;
    };
  }, [layoutKey]);

  // How much the pages shrink: the desk's width against a true A4 page.
  useEffect(() => {
    const el = desk.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / A4_WIDTH_PX));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const cutUp = breaks?.length === shown.length ? breaks : null;
  const sheetPages = shown.map((sheet, i) => {
    const blocks = sheetBlocks(sheet);
    return (cutUp?.[i] ?? [{ blocks: blocks.map((_, b) => b), tall: false }]).map((page) => ({
      blocks: page.blocks.map((b) => blocks[b]),
      tall: page.tall,
    }));
  });
  const total = sheetPages.reduce((n, p) => n + p.length, 0);
  let counter = 0;
  const pages: PageModel[] = sheetPages.flatMap((list, i) =>
    list.map(({ blocks, tall }, j) => ({
      key: `${shown[i].id}-${j}`,
      sheet: shown[i],
      blocks,
      tall,
      continued: j > 0,
      number: ++counter,
      total,
    }))
  );

  // Shrunk pages show the printed marks instead: Rough Notation measures
  // the words on screen and would draw at the wrong size inside a shrunk page.
  const shrunk = scale < 0.999;
  useRoughMarks(
    desk,
    shrunk ? "none" : look.marks,
    look.ink.color,
    look.hand,
    `${layoutKey}|${pages.map((p) => p.blocks.length).join(",")}|${shrunk}`
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
                  ? `${shown[0].topic} · ${questions} question${questions === 1 ? "" : "s"} · ${total} page${total === 1 ? "" : "s"}`
                  : `${shown.length} sheets, ${questions} questions, ${total} pages. Each sheet starts on a new page.`
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
            <section aria-label="Your pages" className="min-w-0">
              <p className="mb-1.5 flex justify-end print:hidden">
                <span className="pen-note">click the heading to rename it ↘</span>
              </p>
              <div
                ref={desk}
                className="hw-pages"
                data-flat-marks={shrunk || undefined}
                style={{ "--hw-page-scale": scale } as CSSProperties}
              >
                {pages.map((page) => (
                  <div key={page.key} className="hw-frame">
                    <Paper page={page} look={look} onRename={rename} />
                  </div>
                ))}
              </div>
              {/* The measuring copy: each shown sheet on one A4 page, written
                  past its bottom and out of sight, so every block can be measured. */}
              <div ref={measure} className="hw-measure" aria-hidden="true">
                {shown.map((sheet) => (
                  <article
                    key={sheet.id}
                    className="hw-paper"
                    data-pattern={look.paper.pattern}
                    data-marks={look.marks}
                    style={lookVars(look)}
                  >
                    <div className="hw-sheet">
                      {sheetBlocks(sheet).map((block) => (
                        <BlockView key={blockKey(block)} block={block} look={look} />
                      ))}
                    </div>
                  </article>
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
