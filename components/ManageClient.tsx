"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Mascot from "./Mascot";
import type { ChannelItem, GenreItem } from "./types";

const GENRE_COLORS = [
  "#FFC900",
  "#FF4911",
  "#4DA6FF",
  "#2FCC71",
  "#FF90E8",
  "#A78BFA",
];

interface ChannelRow {
  channel: ChannelItem;
  genre: GenreItem | null;
}

interface ResolvedPreview {
  ytChannelId: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
}

/** @handles, URLs, and raw channel ids identify one exact channel; plain
 *  names go through search and need a confirmation step. */
function isExactInput(value: string): boolean {
  const t = value.trim();
  return (
    t.includes("youtube.com") || t.startsWith("@") || /^UC[\w-]{20,}$/.test(t)
  );
}

export default function ManageClient() {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [input, setInput] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newGenreName, setNewGenreName] = useState("");
  const [newGenreColor, setNewGenreColor] = useState(GENRE_COLORS[0]);
  const [newGenrePrompt, setNewGenrePrompt] = useState("");
  const [showGenreForm, setShowGenreForm] = useState(false);
  const [editingGenre, setEditingGenre] = useState<GenreItem | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [pending, setPending] = useState<ResolvedPreview | null>(null);

  const load = useCallback(async () => {
    const [channelsRes, genresRes] = await Promise.all([
      fetch("/api/channels").then((r) => r.json()),
      fetch("/api/genres").then((r) => r.json()),
    ]);
    setRows(channelsRes.channels ?? []);
    setGenres(genresRes.genres ?? []);
  }, []);

  useEffect(() => {
    // Async server fetch, not a synchronous state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || adding) return;
    // Plain names resolve via search, which can guess wrong — preview the
    // match and ask for confirmation instead of adding straight away.
    if (!isExactInput(input)) {
      setAdding(true);
      try {
        const res = await fetch(
          `/api/channels/resolve?input=${encodeURIComponent(input.trim())}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Channel not found");
        setPending(data.channel);
      } catch (err) {
        setToast((err as Error).message);
      } finally {
        setAdding(false);
      }
      return;
    }
    await doAdd(input);
  }

  async function doAdd(value: string) {
    setAdding(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: value,
          genreId: selectedGenre ? Number(selectedGenre) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add channel");
      setToast(
        `Added "${data.channel.title}" — backfilled ${data.videosAdded} video${
          data.videosAdded === 1 ? "" : "s"
        } from the last 6 months.`
      );
      setInput("");
      setPending(null);
      await load();
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function addGenre(e: React.FormEvent) {
    e.preventDefault();
    if (!newGenreName.trim()) return;
    const res = await fetch("/api/genres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newGenreName,
        color: newGenreColor,
        askPrompt: newGenrePrompt,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.error ?? "Failed to add genre");
      return;
    }
    setNewGenreName("");
    setNewGenrePrompt("");
    setShowGenreForm(false);
    await load();
  }

  async function saveGenrePrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGenre) return;
    const res = await fetch(`/api/genres/${editingGenre.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askPrompt: editPrompt }),
    });
    if (!res.ok) {
      const data = await res.json();
      setToast(data.error ?? "Failed to update genre");
      return;
    }
    setEditingGenre(null);
    await load();
  }

  async function updateChannel(
    id: number,
    updates: { genreId?: number | null; isActive?: boolean }
  ) {
    await fetch(`/api/channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await load();
  }

  async function deleteChannel(row: ChannelRow) {
    if (
      !confirm(
        `Remove "${row.channel.title}" and all its saved videos from your feed?`
      )
    ) {
      return;
    }
    await fetch(`/api/channels/${row.channel.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16">
      <header className="flex flex-wrap items-center gap-4 py-6">
        <Mascot size={64} />
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">CHANNELS</h1>
          <p className="text-sm font-semibold text-neutral-600">
            who&apos;s on your feed
          </p>
        </div>
        <Link
          href="/"
          className="nb-btn ml-auto rounded-lg px-4 py-2 text-sm"
        >
          ← BACK TO FEED
        </Link>
      </header>

      {toast && (
        <div className="nb mb-6 rounded-lg bg-[var(--yellow)] px-4 py-2 text-sm font-bold">
          {toast}
        </div>
      )}

      {/* Add channel */}
      <form onSubmit={addChannel} className="nb mb-4 rounded-xl p-4">
        <p className="font-display mb-3 text-sm">ADD A CHANNEL</p>
        <div className="flex flex-wrap gap-3">
          <input
            className="nb-input min-w-56 flex-1 rounded-lg px-3 py-2 text-sm"
            placeholder="Paste a channel URL or @handle (e.g. @mkbhd)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <select
            className="nb-input rounded-lg px-3 py-2 text-sm"
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
          >
            <option value="">No genre</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="nb-btn rounded-lg px-5 py-2 text-sm"
            disabled={adding}
          >
            {adding ? "BACKFILLING…" : "+ ADD"}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Adding a channel pulls its last 6 months of uploads right away; the
          cron keeps it fresh after that.
        </p>
        {pending && (
          <div className="nb-sm mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--paper)] p-3">
            {pending.thumbnail && (
              <img
                src={pending.thumbnail}
                alt=""
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full border-2 border-[var(--ink)]"
              />
            )}
            <p className="text-sm">
              Found: <strong>{pending.title}</strong>{" "}
              {pending.handle && (
                <span className="text-neutral-500">{pending.handle}</span>
              )}{" "}
              — is this the one?
            </p>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="nb-btn rounded px-3 py-1.5 text-xs"
                disabled={adding}
                onClick={() => doAdd(pending.ytChannelId)}
              >
                {adding ? "BACKFILLING…" : "YES, ADD IT"}
              </button>
              <button
                type="button"
                className="nb-chip rounded px-3 py-1.5 text-xs"
                onClick={() => setPending(null)}
              >
                NO, CANCEL
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Genres */}
      <div className="nb mb-8 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display mr-2 text-sm">GENRES</p>
          {genres.map((g) => (
            <span
              key={g.id}
              className="nb-sm inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold"
              style={{ backgroundColor: g.color }}
            >
              {g.name}
              {g.askPrompt && <span title={`Suggested question: ${g.askPrompt}`}>💬</span>}
              <button
                type="button"
                title={`Edit suggested question for ${g.name}`}
                onClick={() => {
                  setEditingGenre(g);
                  setEditPrompt(g.askPrompt ?? "");
                }}
                className="cursor-pointer opacity-60 hover:opacity-100"
              >
                ✎
              </button>
              <button
                type="button"
                title={`Delete genre ${g.name}`}
                onClick={async () => {
                  if (!confirm(`Delete genre "${g.name}"? Channels keep their videos.`)) return;
                  await fetch(`/api/genres/${g.id}`, { method: "DELETE" });
                  await load();
                }}
                className="cursor-pointer opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            className="nb-chip rounded-full px-3 py-1 text-xs"
            onClick={() => setShowGenreForm((s) => !s)}
          >
            + NEW GENRE
          </button>
        </div>
        {editingGenre && (
          <form
            onSubmit={saveGenrePrompt}
            className="mt-3 flex flex-wrap items-center gap-3"
          >
            <span className="text-sm font-bold">{editingGenre.name}:</span>
            <input
              className="nb-input min-w-64 flex-1 rounded-lg px-3 py-1.5 text-sm"
              placeholder='Suggested question (e.g. "List all the questions asked in this video") — empty to remove'
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
            />
            <button type="submit" className="nb-btn rounded-lg px-4 py-1.5 text-sm">
              SAVE
            </button>
            <button
              type="button"
              className="nb-chip rounded-lg px-4 py-1.5 text-sm"
              onClick={() => setEditingGenre(null)}
            >
              CANCEL
            </button>
          </form>
        )}
        {showGenreForm && (
          <form onSubmit={addGenre} className="mt-3 flex flex-wrap items-center gap-3">
            <input
              className="nb-input rounded-lg px-3 py-1.5 text-sm"
              placeholder="Genre name (e.g. Finance)"
              value={newGenreName}
              onChange={(e) => setNewGenreName(e.target.value)}
            />
            <input
              className="nb-input min-w-56 rounded-lg px-3 py-1.5 text-sm"
              placeholder="Suggested question (optional)"
              value={newGenrePrompt}
              onChange={(e) => setNewGenrePrompt(e.target.value)}
            />
            <div className="flex gap-1.5">
              {GENRE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Pick color ${color}`}
                  className="h-7 w-7 cursor-pointer rounded-full border-2 border-[var(--ink)]"
                  style={{
                    backgroundColor: color,
                    outline:
                      newGenreColor === color
                        ? "3px solid var(--ink)"
                        : "none",
                    outlineOffset: "2px",
                  }}
                  onClick={() => setNewGenreColor(color)}
                />
              ))}
            </div>
            <button type="submit" className="nb-btn rounded-lg px-4 py-1.5 text-sm">
              SAVE
            </button>
          </form>
        )}
      </div>

      {/* Channel list */}
      <div className="flex flex-col gap-4">
        {rows.length === 0 && (
          <p className="text-center text-sm font-semibold text-neutral-500">
            No channels yet — add your first one above.
          </p>
        )}
        {rows.map((row) => (
          <div
            key={row.channel.id}
            className={`nb flex flex-wrap items-center gap-3 rounded-xl p-3 ${
              row.channel.isActive ? "" : "opacity-60"
            }`}
          >
            {row.channel.thumbnail && (
              <img
                src={row.channel.thumbnail}
                alt=""
                referrerPolicy="no-referrer"
                className="h-12 w-12 rounded-full border-2 border-[var(--ink)]"
              />
            )}
            <div className="min-w-40">
              <p className="font-bold">{row.channel.title}</p>
              <p className="text-xs text-neutral-500">
                {row.channel.handle ?? row.channel.ytChannelId}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                className="nb-input rounded-lg px-2 py-1.5 text-xs"
                value={row.channel.genreId ?? ""}
                onChange={(e) =>
                  updateChannel(row.channel.id, {
                    genreId: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">No genre</option>
                {genres.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                className="nb-chip rounded px-2.5 py-1.5 text-xs"
                data-active={row.channel.isActive}
                onClick={() =>
                  updateChannel(row.channel.id, {
                    isActive: !row.channel.isActive,
                  })
                }
                title={
                  row.channel.isActive
                    ? "Pause fetching (keeps saved videos)"
                    : "Resume fetching"
                }
              >
                {row.channel.isActive ? "ACTIVE" : "PAUSED"}
              </button>
              <button
                className="nb-chip nb-danger rounded px-2.5 py-1.5 text-xs"
                onClick={() => deleteChannel(row)}
              >
                DELETE
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
