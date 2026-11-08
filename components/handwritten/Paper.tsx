import type { CSSProperties, KeyboardEvent, FocusEvent } from "react";
import { askedLabel, splitCode, type WrittenQuestion, type WrittenSheet } from "@/lib/handwritten/document";
import type { resolveStyle } from "@/lib/handwritten/themes";
import { printMarkVars } from "./printMarks";

type Look = ReturnType<typeof resolveStyle>;

/** One piece of a sheet that's never cut in half: its heading, or a question with its answer. */
export type Block =
  | { kind: "heading"; sheet: WrittenSheet }
  | { kind: "item"; sheet: WrittenSheet; question: WrittenQuestion };

export function sheetBlocks(sheet: WrittenSheet): Block[] {
  return [
    { kind: "heading", sheet },
    ...sheet.questions.map((question): Block => ({ kind: "item", sheet, question })),
  ];
}

/** One A4 page of the studio (REF-19): which blocks it holds, and where it sits. */
export interface PageModel {
  key: string;
  sheet: WrittenSheet;
  blocks: Block[];
  /**
   * One block taller than a whole page (FIX-10): the page grows to hold it
   * instead of cutting it off, and the PDF carries it onto the next page.
   */
  tall: boolean;
  /** Not the sheet's first page: a small "…, continued" at the top. */
  continued: boolean;
  /** 1-based, across everything being saved. */
  number: number;
  total: number;
}

/** The look as the CSS variables handwritten.css reads. */
export function lookVars(look: Look): CSSProperties {
  const { paper, ink, hand } = look;
  return {
    "--hw-bg": paper.background,
    "--hw-rule": paper.rule,
    "--hw-margin": paper.margin ?? "transparent",
    "--hw-ink": ink.color,
    "--hw-font": hand.family,
    "--hw-size": `${hand.size}px`,
    "--hw-nudge": `${hand.nudge}px`,
    "--hw-bold": hand.boldWeight,
    ...printMarkVars(ink.color),
  } as CSSProperties;
}

/**
 * One A4 page: a sheet of paper (or a page of index cards) holding some of a
 * sheet's blocks. Everything about the look comes from `look` as CSS
 * variables; the geometry lives in handwritten.css. On screen, marks are
 * drawn on top by useRoughMarks, which finds the words through their
 * data-mark attributes; in print (and on shrunk pages), by the words' own
 * backgrounds (printMarks.ts).
 */
export default function Paper({
  page,
  look,
  onRename,
}: {
  page: PageModel;
  look: Look;
  onRename: (id: number, heading: string) => void;
}) {
  return (
    <article
      className="hw-paper"
      data-pattern={look.paper.pattern}
      data-marks={look.marks}
      data-tall={page.tall || undefined}
      style={lookVars(look)}
      aria-label={`${page.sheet.heading}, page ${page.number} of ${page.total}`}
    >
      {page.continued && <p className="hw-running">{page.sheet.heading}, continued</p>}
      <div className="hw-sheet">
        {page.blocks.map((block) => (
          <BlockView key={blockKey(block)} block={block} look={look} onRename={onRename} />
        ))}
      </div>
      <p className="hw-folio">
        {page.number} / {page.total}
      </p>
    </article>
  );
}

export function blockKey(block: Block): string {
  return block.kind === "heading" ? `h${block.sheet.id}` : `q${block.sheet.id}-${block.question.number}`;
}

/**
 * A block as written on the page. Its outermost element carries the space
 * under it (a blank line, or a card's gap), which the studio measures to cut
 * pages. Without `onRename` (the measuring copy) the heading isn't editable.
 */
export function BlockView({
  block,
  look,
  onRename,
}: {
  block: Block;
  look: Look;
  onRename?: (id: number, heading: string) => void;
}) {
  const cards = look.paper.pattern === "cards";
  if (block.kind === "heading") {
    return cards ? (
      <div className="hw-card" data-block>
        <Heading sheet={block.sheet} onRename={onRename} />
      </div>
    ) : (
      <Heading sheet={block.sheet} onRename={onRename} isBlock />
    );
  }
  const q = block.question;
  const body = (
    <>
      <p className="hw-q">
        <span className="hw-num" data-mark="number">
          {q.number}
          {look.marks === "circle" ? "" : "."}
        </span>
        <span className="hw-qtext" data-mark="question">
          <HandText text={q.question} seed={q.number * 101} />
        </span>{" "}
        <span className="hw-asked">{askedLabel(q.askedIn)}</span>
      </p>
      {q.answer && (
        <p className="hw-ans">
          - <HandText text={q.answer} seed={q.number * 211} />
        </p>
      )}
    </>
  );
  return (
    <div className={cards ? "hw-card" : "hw-item"} data-block>
      {body}
    </div>
  );
}

/** The heading: click it and type. Enter or clicking away saves it. */
function Heading({
  sheet,
  onRename,
  isBlock = false,
}: {
  sheet: WrittenSheet;
  onRename?: (id: number, heading: string) => void;
  /** On paper (not a card), the heading is the block itself. */
  isBlock?: boolean;
}) {
  const block = isBlock ? { "data-block": true } : {};
  if (!onRename) {
    return (
      <div className="hw-heading" {...block}>
        <span className="hw-heading-text">{sheet.heading}</span> <span className="hw-count">({sheet.questions.length})</span>
      </div>
    );
  }
  const save = (e: FocusEvent<HTMLSpanElement>) => {
    const text = (e.currentTarget.textContent ?? "").trim();
    // Emptied: back to "<Topic> questions".
    if (!text) e.currentTarget.textContent = sheet.defaultHeading;
    onRename(sheet.id, text);
  };
  const keys = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  return (
    <div className="hw-heading" {...block}>
      {/* Keyed by the text, so a saved or restored heading replaces what was typed. */}
      <span
        key={sheet.heading}
        className="hw-heading-text"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-label={`Heading for ${sheet.topic}`}
        onBlur={save}
        onKeyDown={keys}
      >
        {sheet.heading}
      </span>{" "}
      <span className="hw-count">({sheet.questions.length})</span>
    </div>
  );
}

/**
 * Text in the hand: each word gets its own slight tilt, bounce and ink
 * weight, worked out from the word itself, so it's the same on every render
 * (and in the PDF). Code-ish words stay upright and steady.
 */
function HandText({ text, seed }: { text: string; seed: number }) {
  let k = seed;
  return (
    <>
      {splitCode(text).map((part, i) =>
        part.code ? (
          <span key={i} className="hw-code">
            {part.text}
          </span>
        ) : (
          part.text.split(/(\s+)/).map((word, j) =>
            word.trim() ? (
              <span key={`${i}-${j}`} className="hw-w" style={wobble(word, k++)}>
                {word}
              </span>
            ) : (
              word
            )
          )
        )
      )}
    </>
  );
}

function wobble(word: string, index: number): CSSProperties {
  let h = 7 + index;
  for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return {
    transform: `rotate(${((h % 9) - 4) * 0.28}deg) translateY(${((h >> 3) % 5) - 2}px)`,
    opacity: Number((0.84 + (h % 17) / 100).toFixed(2)),
  };
}
