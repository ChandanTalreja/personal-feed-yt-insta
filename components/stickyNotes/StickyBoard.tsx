"use client";

import { useEffect, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import PageTitle from "@/components/ui/PageTitle";
import type { StickyNoteItem } from "@/components/types";
import { api, rememberedReply } from "@/lib/api-client";
import { STICKY_COLORS, type StickyColor } from "@/lib/stickyColors";
import StickyNote, { PAPER } from "./StickyNote";

const PATH = "/api/sticky-notes";

/** Pinned first, then newest first (the server's order too). */
function inOrder(notes: StickyNoteItem[]): StickyNoteItem[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt) || a.id - b.id
  );
}

/**
 * Sticky notes (FEAT-17): the board the Feed's sidebar opens in place of the
 * videos. For anything that isn't a video: kept out of the Notebook and ⌘K.
 */
export default function StickyBoard({
  onFilters,
  below,
}: {
  /** Narrow screens: opens the sidebar (the way back to the videos). */
  onFilters: () => void;
  /** Shown under the title (the narrow-screen sidebar, when open). */
  below?: ReactNode;
}) {
  // The copy remembered in this tab first (instant), then the server's.
  const [notes, setNotes] = useState<StickyNoteItem[] | null>(
    () => rememberedReply<{ notes: StickyNoteItem[] }>(PATH)?.notes ?? null
  );
  const [color, setColor] = useState<StickyColor>("yellow");
  const [fresh, setFresh] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<{ notes: StickyNoteItem[] }>(PATH, { fallback: "Couldn't load your sticky notes" })
      .then((reply) => setNotes(reply.notes))
      .catch((err) => setMessage((err as Error).message));
  }, []);

  async function add() {
    setCreating(true);
    setMessage(null);
    try {
      const { note } = await api<{ note: StickyNoteItem }>(PATH, {
        method: "POST",
        body: { color },
        fallback: "Couldn't add a note",
      });
      setNotes((list) => inOrder([...(list ?? []), note]));
      setFresh(note.id);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const saved = (note: StickyNoteItem) =>
    setNotes((list) => inOrder((list ?? []).map((n) => (n.id === note.id ? note : n))));
  const removed = (id: number) => setNotes((list) => (list ?? []).filter((n) => n.id !== id));

  const pinned = notes?.filter((n) => n.pinned).length ?? 0;
  const summary =
    notes == null
      ? " "
      : `${notes.length} note${notes.length === 1 ? "" : "s"}${pinned ? ` · ${pinned} pinned` : ""}`;

  const newNote = (
    <Button variant="primary" onClick={add} busy={creating} busyLabel="Adding">
      <Icon name="plus" size={15} />
      New note
    </Button>
  );

  return (
    <>
      <PageTitle title="Sticky notes" note="for the thoughts in between" summary={summary}>
        <Button className="lg:hidden" onClick={onFilters}>
          Filters
        </Button>
        <div role="radiogroup" aria-label="Paper for the next note" className="flex items-center gap-1.5">
          <span className="mr-1 text-meta text-muted">New note in</span>
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`${c} paper`}
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-[5px] ${PAPER[c]} ${
                color === c ? "ring-[1.5px] ring-ink" : "ring-1 ring-ink/20 hover:ring-ink"
              }`}
            />
          ))}
        </div>
        {notes != null && notes.length > 0 && newNote}
      </PageTitle>

      {below}

      {message && (
        <p role="status" className="mb-5 rounded-md border-[1.5px] border-ink bg-surface px-4 py-2 text-sm font-semibold">
          {message}
        </p>
      )}

      {notes == null ? (
        <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-[170px] animate-pulse border border-line bg-surface" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState title="Nothing stuck here yet" note="go on, stick one" action={newNote}>
          For anything that isn&apos;t a video: a reminder, an idea, a list. Type &ldquo;- &rdquo; for a bullet
          or &ldquo;[] &rdquo; for a tick box.
        </EmptyState>
      ) : (
        <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {notes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              autoFocus={note.id === fresh}
              onSaved={saved}
              onRemoved={removed}
              onError={setMessage}
            />
          ))}
        </div>
      )}
    </>
  );
}
