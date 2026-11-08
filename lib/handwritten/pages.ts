// Handwritten cheat sheets (FEAT-16), part 3: cutting a sheet into A4 pages
// (REF-19). The studio measures each block of a sheet (its heading, each
// question with its answer, or each index card) written out at A4 width;
// this decides which blocks go on which page. Pure, so the screen and the
// PDF are cut from the same numbers.

/** The A4 page, in CSS pixels (96 per inch): 210 mm × 297 mm. */
export const A4_WIDTH_PX = (210 * 96) / 25.4;

export interface BlockSize {
  /** The block's own height. */
  height: number;
  /** The space under it before the next block (a blank line, a card's gap). */
  after: number;
}

/**
 * Fills pages in order: a block goes on the current page when its own height
 * still fits (the space under the last block may run into the bottom margin),
 * otherwise it starts the next page. A block is never cut in half, so a
 * question and its answer stay together. A block taller than a whole page
 * gets a page of its own, which then grows to hold it (FIX-10). Returns the
 * block indexes on each page.
 */
export function paginate(blocks: BlockSize[], room: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  blocks.forEach((block, i) => {
    if (page.length > 0 && used + block.height > room + 0.5) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(i);
    used += block.height + block.after;
  });
  if (page.length > 0) pages.push(page);
  return pages;
}
