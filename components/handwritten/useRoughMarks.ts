"use client";

import { useEffect, type RefObject } from "react";
import { HIGHLIGHTER, type Hand, type MarkId } from "@/lib/handwritten/themes";

// The only file that knows Rough Notation (hand-drawn marks, MIT, ~4 KB).
// Swapping it for something else, or drawing marks another way, happens here.

/**
 * Draws the marks over the written pages inside `root`: a highlighter swipe
 * or an underline across every question, or a circle round every number.
 * Redrawn whenever `redrawKey` changes (other sheets, paper, hand, heading).
 */
export function useRoughMarks(
  root: RefObject<HTMLElement | null>,
  marks: MarkId,
  color: string,
  hand: Hand,
  redrawKey: string
) {
  useEffect(() => {
    const el = root.current;
    if (!el || marks === "none") return;
    let cancelled = false;
    let drawn: { remove(): void }[] = [];

    (async () => {
      // Only this page loads it.
      const { annotate, annotationGroup } = await import("rough-notation");
      // Measure the real words: wait for the hand's regular and bold faces
      // (questions are bold, which changes how wide they are).
      const paper = el.querySelector<HTMLElement>(".hw-paper");
      if (paper && document.fonts) {
        const family = getComputedStyle(paper).fontFamily;
        await Promise.all([
          document.fonts.load(`400 ${hand.size}px ${family}`),
          document.fonts.load(`${hand.boldWeight} ${hand.size}px ${family}`),
        ]).catch(() => {});
        await document.fonts.ready;
      }
      if (cancelled) return;

      const motion = {
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        animationDuration: 260,
      };
      const targets = el.querySelectorAll<HTMLElement>(
        marks === "circle" ? '[data-mark="number"]' : '[data-mark="question"]'
      );
      const notes = [...targets].map((target) =>
        annotate(
          target,
          marks === "circle"
            ? { type: "circle", color, strokeWidth: 1.4, padding: [2, 7], ...motion }
            : marks === "highlight"
              ? { type: "highlight", color: HIGHLIGHTER, multiline: true, iterations: 1, padding: [0, 3], ...motion }
              : { type: "underline", color, strokeWidth: 1.5, multiline: true, iterations: 1, padding: 1, ...motion }
        )
      );
      drawn = notes;
      annotationGroup(notes).show();
    })();

    return () => {
      cancelled = true;
      drawn.forEach((note) => note.remove());
    };
  }, [root, marks, color, hand, redrawKey]);
}
