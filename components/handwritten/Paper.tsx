import type { CSSProperties, KeyboardEvent, FocusEvent } from "react";
import { askedLabel, splitCode, type WrittenSheet } from "@/lib/handwritten/document";
import type { resolveStyle } from "@/lib/handwritten/themes";
import { printMarkVars } from "./printMarks";

type Look = ReturnType<typeof resolveStyle>;

/**
 * One cheat sheet, written on one sheet of paper (or a stack of index cards).
 * Everything about the look comes from `look` as CSS variables; the geometry
 * lives in handwritten.css. On screen, marks are drawn on top by
 * useRoughMarks, which finds the words through their data-mark attributes;
 * in print, by the words' own backgrounds (printMarks.ts).
 */
export default function Paper({
  sheet,
  look,
  newPage,
  onRename,
}: {
  sheet: WrittenSheet;
  look: Look;
  /** Not the first sheet: in the PDF it starts a new page. */
  newPage: boolean;
  onRename: (id: number, heading: string) => void;
}) {
  const { paper, ink, hand, marks } = look;
  const vars = {
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
  const cards = paper.pattern === "cards";

  const heading = <Heading sheet={sheet} onRename={onRename} />;
  const items = sheet.questions.map((q) => {
    const body = (
      <>
        <p className="hw-q">
          <span className="hw-num" data-mark="number">
            {q.number}
            {marks === "circle" ? "" : "."}
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
    return cards ? (
      <div key={q.number} className="hw-card">{body}</div>
    ) : (
      <div key={q.number} className="hw-item">{body}</div>
    );
  });

  return (
    <article
      className={`hw-paper ${newPage ? "hw-new-page" : ""}`}
      data-pattern={paper.pattern}
      data-marks={marks}
      style={vars}
      aria-label={sheet.heading}
    >
      <div className="hw-sheet">
        {cards ? <div className="hw-card">{heading}</div> : heading}
        {items}
      </div>
    </article>
  );
}

/** The heading: click it and type. Enter or clicking away saves it. */
function Heading({ sheet, onRename }: { sheet: WrittenSheet; onRename: (id: number, heading: string) => void }) {
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
    <div className="hw-heading">
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
