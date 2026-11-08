// How many sticky notes there are, as last seen in this tab (FEAT-17). It
// outlives the Feed page, so coming back to a page the router kept (its
// first screen up to 5 minutes old) still shows the number you left.
let known: number | null = null;

export function knownNoteCount(): number | null {
  return known;
}

export function setKnownNoteCount(count: number): void {
  known = count;
}
