"use client";

import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import type { StickyNoteItem } from "@/components/types";
import { api } from "@/lib/api-client";
import { STICKY_COLORS } from "@/lib/stickyColors";
import NoteLines from "./NoteLines";
import { isBlank, parseBody, toBody, type Line } from "./lines";

/** Each paper's class (the colours are `--color-tile-*` in globals.css). */
export const PAPER: Record<string, string> = {
  yellow: "bg-tile-yellow",
  pink: "bg-tile-pink",
  green: "bg-tile-green",
  blue: "bg-tile-blue",
  peach: "bg-tile-peach",
  lilac: "bg-tile-lilac",
};

/** Typing is saved this long after the last key (and at once when you click away). */
const SAVE_AFTER_MS = 700;

/**
 * One sticky note: coloured paper, slightly tilted, that straightens and
 * lifts while you write in it. Its controls (paper, plain or handwritten,
 * pin, delete) show when you hover or write. A note left empty is removed
 * when you click away, so "New note" never leaves blank squares behind.
 */
export default function StickyNote({
  note,
  autoFocus,
  onSaved,
  onRemoved,
  onError,
}: {
  note: StickyNoteItem;
  autoFocus: boolean;
  onSaved: (note: StickyNoteItem) => void;
  onRemoved: (id: number) => void;
  onError: (message: string) => void;
}) {
  const [lines, setLines] = useState<Line[]>(() => parseBody(note.body));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saved = useRef(note.body);
  const timer = useRef<number | null>(null);
  const latest = useRef(lines);

  // Leaving the page with typing not yet saved: send it anyway.
  useEffect(
    () => () => {
      if (timer.current == null) return;
      window.clearTimeout(timer.current);
      const body = toBody(latest.current);
      if (body !== saved.current) {
        api(`/api/sticky-notes/${note.id}`, { method: "PATCH", body: { body }, keepalive: true }).catch(() => {});
      }
    },
    [note.id]
  );

  async function saveBody(next: Line[]) {
    timer.current = null;
    const body = toBody(next);
    if (body === saved.current) return;
    saved.current = body;
    try {
      const reply = await api<{ note: StickyNoteItem }>(`/api/sticky-notes/${note.id}`, {
        method: "PATCH",
        body: { body },
        fallback: "Couldn't save that note",
      });
      onSaved(reply.note);
    } catch (err) {
      saved.current = "";
      onError((err as Error).message);
    }
  }

  function write(next: Line[]) {
    setLines(next);
    latest.current = next;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveBody(next), SAVE_AFTER_MS);
  }

  async function remove() {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    onRemoved(note.id);
    try {
      await api(`/api/sticky-notes/${note.id}`, { method: "DELETE", fallback: "Couldn't delete that note" });
    } catch (err) {
      onError((err as Error).message);
    }
  }

  // Clicked away (focus left the note, not just moved inside it).
  function left(e: FocusEvent<HTMLElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setConfirmDelete(false);
    if (isBlank(latest.current)) {
      remove();
      return;
    }
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      saveBody(latest.current);
    }
  }

  /** Paper, hand or pin: shown at once, then saved. */
  async function set(change: Partial<Pick<StickyNoteItem, "color" | "handwritten" | "pinned">>) {
    const before = note;
    onSaved({ ...note, ...change });
    try {
      const reply = await api<{ note: StickyNoteItem }>(`/api/sticky-notes/${note.id}`, {
        method: "PATCH",
        body: change,
        fallback: "Couldn't change that note",
      });
      onSaved(reply.note);
    } catch (err) {
      onSaved(before);
      onError((err as Error).message);
    }
  }

  // A small, steady tilt of its own (from its id), so the board looks stuck-on.
  const tilt = { "--tilt": `${(((note.id * 37) % 5) - 2) * 0.45}deg` } as CSSProperties;

  return (
    <article
      onBlur={left}
      style={tilt}
      className={`group/note relative flex min-h-[170px] flex-col gap-3 border border-line p-4 pb-3 shadow-sticker transition-[transform,box-shadow] duration-150 [transform:rotate(var(--tilt))] focus-within:[transform:translate(-2px,-2px)] focus-within:shadow-lift ${
        PAPER[note.color] ?? PAPER.yellow
      } ${note.handwritten ? "font-pen text-xl" : "text-sm"}`}
    >
      {note.pinned && (
        <span className="absolute -top-2.5 right-3 text-ink" title="Pinned">
          <Icon name="pin" size={18} lit />
        </span>
      )}

      <div className="flex-1">
        <NoteLines lines={lines} onChange={write} autoFocus={autoFocus} label="Sticky note" />
      </div>

      {/* The note's controls, quiet until you hover or write in it (always
          shown where there's no hover, on touch screens). */}
      <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-meta opacity-0 [font-family:var(--font-body),sans-serif] transition-opacity group-focus-within/note:opacity-100 group-hover/note:opacity-100 [@media(hover:none)]:opacity-100">
        {confirmDelete ? (
          <>
            <button
              type="button"
              onClick={remove}
              className="flex h-7 items-center gap-1 rounded-sm bg-danger px-2 font-semibold text-white hover:brightness-110"
            >
              <Icon name="trash" size={13} />
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="h-7 rounded-sm border border-ok bg-tile-green px-2 font-semibold text-ink hover:brightness-95"
            >
              Keep
            </button>
          </>
        ) : (
          <>
            <div role="radiogroup" aria-label="Paper" className="flex items-center gap-1">
              {STICKY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={note.color === c}
                  aria-label={`${c} paper`}
                  onClick={() => set({ color: c })}
                  className={`h-3.5 w-3.5 rounded-[4px] ${PAPER[c]} ${
                    note.color === c ? "ring-[1.5px] ring-ink" : "ring-1 ring-ink/25 hover:ring-ink"
                  }`}
                />
              ))}
            </div>
            <span className="flex-1" />
            <NoteButton
              label={note.handwritten ? "Write it plain" : "Write it by hand"}
              on={note.handwritten}
              onClick={() => set({ handwritten: !note.handwritten })}
            >
              <Icon name="textStyle" size={15} />
            </NoteButton>
            <NoteButton label={note.pinned ? "Unpin" : "Pin to the top"} on={note.pinned} onClick={() => set({ pinned: !note.pinned })}>
              <Icon name="pin" size={15} lit={note.pinned} />
            </NoteButton>
            <NoteButton label="Delete this note" on={false} onClick={() => setConfirmDelete(true)} danger>
              <Icon name="trash" size={15} />
            </NoteButton>
          </>
        )}
      </div>
    </article>
  );
}

function NoteButton({
  label,
  on,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={danger ? undefined : on}
      onClick={onClick}
      className={`icon-hover flex h-7 w-6 items-center justify-center rounded-sm transition-colors ${
        on ? "bg-ink/10 text-ink" : danger ? "text-ink/60 hover:text-danger" : "text-ink/60 hover:bg-ink/5 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
