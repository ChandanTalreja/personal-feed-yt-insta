"use client";

import { useState } from "react";
import GenreColorPicker from "./GenreColorPicker";
import Button from "./ui/Button";
import Icon from "./ui/Icon";
import { GENRE_PALETTE, sameColor } from "@/lib/color";
import type { GenreItem } from "./types";

export type GenreFilter = "all" | "none" | number;

interface Draft {
  name: string;
  color: string;
  askPrompt: string;
}

/**
 * The Channels page's right-hand panel: every genre with how many channels
 * it has. Clicking a genre narrows the table to it; the pencil opens an
 * editor in place (name, colour, suggested question, delete).
 */
export default function GenresPanel({
  genres,
  counts,
  filter,
  onFilter,
  onChanged,
  onError,
}: {
  genres: GenreItem[];
  /** Channels per genre id, plus "none" and "all". */
  counts: Record<string, number>;
  filter: GenreFilter;
  onFilter: (f: GenreFilter) => void;
  /** Something was saved: reload genres and channels. */
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  // "new" = the add form; a number = editing that genre; null = neither.
  const [editing, setEditing] = useState<"new" | number | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", color: GENRE_PALETTE[0], askPrompt: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  function startNew() {
    // Start a new genre on the first colour nobody uses yet.
    const free = GENRE_PALETTE.find((c) => !genres.some((g) => sameColor(g.color, c)));
    setDraft({ name: "", color: free ?? GENRE_PALETTE[0], askPrompt: "" });
    setConfirmDelete(false);
    setEditing(editing === "new" ? null : "new");
  }

  function startEdit(g: GenreItem) {
    setDraft({ name: g.name, color: g.color, askPrompt: g.askPrompt ?? "" });
    setConfirmDelete(false);
    setEditing(editing === g.id ? null : g.id);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(editing === "new" ? "/api/genres" : `/api/genres/${editing}`, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the genre");
      setEditing(null);
      await onChanged();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/genres/${id}`, { method: "DELETE" });
      if (filter === id) onFilter("all");
      setEditing(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const editor = (g: GenreItem | null) => (
    <form onSubmit={save} className="flex flex-col gap-2.5 border-t border-line bg-cream p-3">
      <input
        className="nb-input h-9 px-2.5 text-sm"
        placeholder="Genre name, e.g. Finance"
        value={draft.name}
        maxLength={40}
        autoFocus
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        aria-label="Genre name"
      />
      <input
        className="nb-input h-9 px-2.5 text-sm"
        placeholder="Suggested question (optional)"
        value={draft.askPrompt}
        onChange={(e) => setDraft({ ...draft, askPrompt: e.target.value })}
        aria-label="Suggested question for this genre"
      />
      <p className="-mt-1 text-xs text-muted">
        Shows first in the Ask tab for this genre&apos;s videos.
      </p>
      <GenreColorPicker
        value={draft.color}
        onChange={(color) => setDraft({ ...draft, color })}
        taken={genres.filter((x) => x.id !== g?.id)}
        previewName={draft.name}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={!draft.name.trim()} busy={busy} busyLabel="Saving…">
          {g ? "Save" : "Add genre"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
          Cancel
        </Button>
        {g && !confirmDelete && (
          <button
            type="button"
            className="ml-auto flex items-center gap-1 text-meta font-semibold text-danger hover:underline"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" size={13} duotone={false} />
            Delete
          </button>
        )}
      </div>
      {g && confirmDelete && (
        <div role="alert" className="rounded-md border-[1.5px] border-danger bg-surface p-3 text-meta">
          <p className="font-semibold">Delete “{g.name}”?</p>
          <p className="mt-1 text-muted">
            Its {counts[g.id] ?? 0} channel{(counts[g.id] ?? 0) === 1 ? "" : "s"} keep their
            videos and move to “No genre”.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="border-danger! bg-danger! text-white!" onClick={() => remove(g.id)} disabled={busy}>
              Delete genre
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </form>
  );

  const row = (
    key: string,
    label: string,
    value: GenreFilter,
    swatch: string | null,
    genre: GenreItem | null
  ) => {
    const active = filter === value;
    return (
      <li key={key}>
        <div
          className={`group flex items-center border-t border-line first:border-t-0 transition-colors ${
            active ? "bg-primary/25" : "hover:bg-ink/[0.03]"
          }`}
        >
          <button
            type="button"
            onClick={() => onFilter(active ? "all" : value)}
            aria-pressed={active}
            className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-4 text-left text-sm"
          >
            <span
              className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
              style={{ backgroundColor: swatch ?? "var(--color-line)" }}
            />
            <span className={`min-w-0 flex-1 truncate ${active ? "font-semibold" : ""}`}>{label}</span>
            {genre?.askPrompt && (
              <span title={`Suggested question: ${genre.askPrompt}`} className="shrink-0 text-muted">
                <Icon name="ask" size={14} />
              </span>
            )}
            <span className="shrink-0 font-mono text-xs text-muted">{counts[key] ?? 0} ch</span>
          </button>
          {genre ? (
            <button
              type="button"
              aria-label={`Edit ${genre.name}`}
              aria-expanded={editing === genre.id}
              onClick={() => startEdit(genre)}
              className={`icon-hover mx-2 flex h-7 w-7 items-center justify-center rounded-sm ${
                editing === genre.id ? "bg-ink text-cream" : "text-muted hover:bg-ink/5 hover:text-ink"
              }`}
            >
              <Icon name="pencil" size={14} />
            </button>
          ) : (
            <span className="mx-2 w-7" />
          )}
        </div>
        {genre && editing === genre.id && editor(genre)}
      </li>
    );
  };

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-muted">Genres</h2>
        <button
          type="button"
          onClick={startNew}
          aria-expanded={editing === "new"}
          className="flex items-center gap-1 text-meta font-semibold hover:underline"
        >
          <Icon name="plus" size={13} />
          New
        </button>
      </div>
      {editing === "new" && editor(null)}
      <ul>
        {row("all", "All channels", "all", "var(--color-ink)", null)}
        {genres.map((g) => row(String(g.id), g.name, g.id, g.color, g))}
        {(counts.none ?? 0) > 0 && row("none", "No genre", "none", null, null)}
      </ul>
    </section>
  );
}
