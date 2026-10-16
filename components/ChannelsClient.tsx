"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import TopBar from "./TopBar";
import GenresPanel, { type GenreFilter } from "./GenresPanel";
import AskSuggestionsEditor from "./AskSuggestionsEditor";
import Button from "./ui/Button";
import Icon from "./ui/Icon";
import SegmentedControl from "./ui/SegmentedControl";
import type { ChannelItem, GenreItem } from "./types";
import { timeAgo } from "@/lib/format";
import { notifyNavChanged } from "@/lib/nav-events";

interface Row {
  channel: ChannelItem;
  genre: GenreItem | null;
  videoCount: number;
  shortCount: number;
  lastUploadAt: string | null;
}

interface ResolvedPreview {
  ytChannelId: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
}

type SortKey = "name" | "videos" | "last";
type StatusFilter = "all" | "quiet" | "paused";

/** No upload in this many days → "quiet": worth a look before it's pruned. */
const QUIET_DAYS = 90;
const DAY = 86_400_000;

/** @handles, URLs, and raw channel ids identify one exact channel; plain
 *  names go through search and need a confirmation step. */
function isExactInput(value: string): boolean {
  const t = value.trim();
  return t.includes("youtube.com") || t.startsWith("@") || /^UC[\w-]{20,}$/.test(t);
}

function isQuiet(r: Row, now: number): boolean {
  return r.lastUploadAt == null || now - new Date(r.lastUploadAt).getTime() > QUIET_DAYS * DAY;
}

/** "Active", "Paused", or "No uploads 4 mo". */
function statusOf(r: Row, now: number): { label: string; tone: "ok" | "paused" | "quiet" } {
  if (!r.channel.isActive) return { label: "Paused", tone: "paused" };
  if (r.lastUploadAt == null) return { label: "No uploads stored", tone: "quiet" };
  if (isQuiet(r, now)) {
    const months = Math.floor((now - new Date(r.lastUploadAt).getTime()) / (30.4 * DAY));
    return { label: `No uploads ${months} mo`, tone: "quiet" };
  }
  return { label: "Active", tone: "ok" };
}

/**
 * The Channels page (replaces Manage): add a channel on top; below, a dense
 * table of every channel with what it uploads and when, checkboxes for bulk
 * changes, and the genres panel on the right.
 */
export default function ChannelsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Captured once per load, so "now" doesn't drift between rows.
  const [now, setNow] = useState(() => Date.now());

  // Add bar
  const [input, setInput] = useState("");
  const [addGenre, setAddGenre] = useState("");
  const [years, setYears] = useState("1");
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<ResolvedPreview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Table
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState<GenreFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [menuFor, setMenuFor] = useState<number | null>(null);

  // Bulk work
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState<string | null>(null); // "Moving…", "Backfilling 2 of 5 · KodeKloud"
  const stopBackfill = useRef(false);
  // While a just-added channel is still fetching older uploads.
  const [addProgress, setAddProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [channelsRes, genresRes] = await Promise.all([
      fetch("/api/channels").then((r) => r.json()),
      fetch("/api/genres").then((r) => r.json()),
    ]);
    setRows(channelsRes.channels ?? []);
    setGenres(genresRes.genres ?? []);
    setNow(Date.now());
    setLoaded(true);
  }, []);

  useEffect(() => {
    // Async server fetch, not a synchronous state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  // "+ Add channel" in the top bar links to /channels#add: put the cursor in
  // the box (also when already on this page and the link only changes the #).
  useEffect(() => {
    const focusIfAdd = () => {
      if (window.location.hash === "#add") inputRef.current?.focus();
    };
    focusIfAdd();
    window.addEventListener("hashchange", focusIfAdd);
    return () => window.removeEventListener("hashchange", focusIfAdd);
  }, []);

  // Close the ⋯ menu on any outside click or Esc.
  useEffect(() => {
    if (menuFor == null) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest("[data-row-menu]")) return;
      setMenuFor(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menuFor]);

  // ---------- Adding ----------

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || adding) return;
    // Plain names resolve via search, which can guess wrong — preview the
    // match and ask for confirmation instead of adding straight away.
    if (!isExactInput(input)) {
      setAdding(true);
      try {
        const res = await fetch(`/api/channels/resolve?input=${encodeURIComponent(input.trim())}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't find that channel");
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
          genreId: addGenre ? Number(addGenre) : null,
          years: Number(years),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't add the channel");
      const y = Math.round((data.backfillMonths ?? 12) / 12);
      let added: number = data.videosAdded;
      // A busy channel with a deep window doesn't fit one request: carry on
      // from where the server stopped until it's all fetched.
      if (data.cursor) {
        added += await continueBackfill(data.channel.id, y, data.cursor, (n) =>
          setAddProgress(`Fetching older uploads… ${added + n} so far`)
        );
      }
      setToast(
        `Added ${data.channel.title}, with ${added} video${
          added === 1 ? "" : "s"
        } from the last ${y === 1 ? "year" : `${y} years`}.`
      );
      setInput("");
      setPending(null);
      await load();
      notifyNavChanged();
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setAdding(false);
      setAddProgress(null);
    }
  }

  /**
   * Keeps calling /backfill with the server's bookmark until the window is
   * done (or Stop is pressed). Each call fits Netlify's 10-second limit.
   * Returns how many videos were added; `onProgress` gets the running total.
   */
  async function continueBackfill(
    id: number,
    years: number,
    cursor: string | null,
    onProgress: (added: number) => void
  ): Promise<number> {
    let added = 0;
    do {
      if (stopBackfill.current) break;
      const res = await fetch(`/api/channels/${id}/backfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ years, cursor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backfill failed");
      added += data.videosAdded ?? 0;
      cursor = data.cursor;
      onProgress(added);
    } while (cursor);
    return added;
  }

  // ---------- Changing one or many ----------

  /** One request for any number of channels (see /api/channels/bulk). */
  async function bulk(ids: number[], action: "move" | "pause" | "resume" | "delete", genreId?: number | null) {
    const res = await fetch("/api/channels/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action, genreId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "That didn't work");
    return data.changed as number;
  }

  async function run(label: string, fn: () => Promise<string>) {
    setWorking(label);
    try {
      setToast(await fn());
      await load();
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setWorking(null);
    }
  }

  const plural = (n: number) => `${n} channel${n === 1 ? "" : "s"}`;

  function moveTo(ids: number[], genreId: number | null) {
    const name = genreId == null ? "No genre" : genres.find((g) => g.id === genreId)?.name;
    return run("Moving…", async () => {
      const n = await bulk(ids, "move", genreId);
      return `Moved ${plural(n)} to ${name}.`;
    });
  }

  function setPaused(ids: number[], pause: boolean) {
    return run(pause ? "Pausing…" : "Resuming…", async () => {
      const n = await bulk(ids, pause ? "pause" : "resume");
      return pause
        ? `Paused ${plural(n)}. Their videos stay; they just aren't checked for new ones.`
        : `Resumed ${plural(n)}.`;
    });
  }

  async function deleteIds(ids: number[]) {
    await run("Deleting…", async () => {
      const n = await bulk(ids, "delete");
      setSelected(new Set());
      setConfirmDelete(false);
      notifyNavChanged();
      return `Deleted ${plural(n)}.`;
    });
  }

  /**
   * Backfill N years: make sure every upload from that window is stored.
   * 1Y repairs gaps (what "Re-sync" used to do); 3Y reaches further back on
   * a channel added with 1Y — no delete and re-add. Fetching from YouTube
   * takes seconds per channel and Netlify stops a request at 10 s, so it's
   * one channel at a time (each in as many short requests as it needs),
   * with progress and a Stop.
   */
  async function backfill(ids: number[], years: number) {
    stopBackfill.current = false;
    let recovered = 0;
    let done = 0;
    const failed: string[] = [];
    for (const id of ids) {
      if (stopBackfill.current) break;
      const title = rows.find((r) => r.channel.id === id)?.channel.title ?? "";
      const step = `Backfilling ${years}Y · ${done + 1} of ${ids.length} · ${title}`;
      setWorking(step);
      try {
        recovered += await continueBackfill(id, years, null, (n) =>
          setWorking(n > 0 ? `${step} · ${n} found` : step)
        );
      } catch {
        failed.push(title);
      }
      done++;
    }
    setWorking(null);
    const stopped = stopBackfill.current && done < ids.length ? ` Stopped after ${done}.` : "";
    setToast(
      `Backfilled ${plural(done - failed.length)} (last ${years === 1 ? "year" : `${years} years`}): ${
        recovered > 0 ? `found ${recovered} missing video${recovered === 1 ? "" : "s"}` : "nothing was missing"
      }.${failed.length ? ` Failed: ${failed.join(", ")}.` : ""}${stopped}`
    );
    await load();
    if (recovered > 0) notifyNavChanged();
  }

  // ---------- What's on screen ----------

  const q = query.trim().toLowerCase();
  const visible = rows
    .filter((r) => {
      if (genreFilter === "none" && r.channel.genreId != null) return false;
      if (typeof genreFilter === "number" && r.channel.genreId !== genreFilter) return false;
      if (statusFilter === "paused" && r.channel.isActive) return false;
      if (statusFilter === "quiet" && !(r.channel.isActive && isQuiet(r, now))) return false;
      if (!q) return true;
      return (
        r.channel.title.toLowerCase().includes(q) ||
        (r.channel.handle ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const d = sort.dir;
      if (sort.key === "videos") return d * (a.videoCount + a.shortCount - (b.videoCount + b.shortCount));
      if (sort.key === "last") {
        const at = a.lastUploadAt ? new Date(a.lastUploadAt).getTime() : 0;
        const bt = b.lastUploadAt ? new Date(b.lastUploadAt).getTime() : 0;
        return d * (at - bt);
      }
      return d * a.channel.title.localeCompare(b.channel.title);
    });

  const selectedRows = rows.filter((r) => selected.has(r.channel.id));
  const selectedIds = selectedRows.map((r) => r.channel.id);
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.channel.id));
  const pausedCount = rows.filter((r) => !r.channel.isActive).length;
  const quietCount = rows.filter((r) => r.channel.isActive && isQuiet(r, now)).length;
  const selectedVideos = selectedRows.reduce((n, r) => n + r.videoCount + r.shortCount, 0);

  const genreCounts: Record<string, number> = { all: rows.length, none: 0 };
  for (const r of rows) {
    const key = r.channel.genreId == null ? "none" : String(r.channel.genreId);
    genreCounts[key] = (genreCounts[key] ?? 0) + 1;
  }

  function toggle(id: number) {
    setConfirmDelete(false);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setConfirmDelete(false);
    setSelected((s) => {
      const next = new Set(s);
      for (const r of visible) {
        if (allVisibleSelected) next.delete(r.channel.id);
        else next.add(r.channel.id);
      }
      return next;
    });
  }

  function sortBy(key: SortKey) {
    // Name starts A→Z; numbers and dates start biggest/newest first.
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  }

  // Phones get three columns (tick · channel with a summary line · menu);
  // from tablet width up, the full table.
  const GRID =
    "grid grid-cols-[28px_minmax(0,1fr)_32px] items-center gap-x-3 " +
    "md:grid-cols-[36px_minmax(0,2.4fr)_minmax(0,1.3fr)_0.8fr_1fr_1.1fr_40px]";
  const WIDE = "hidden md:flex";

  return (
    <>
      <TopBar />
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 sm:px-6">
        {/* Title */}
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <h1 className="font-display text-[34px] leading-none">Channels</h1>
            <p className="mt-2 font-mono text-[13px] font-bold text-ink/85">
              {loaded ? (
                <>
                  {plural(rows.length)}
                  {pausedCount > 0 && <> · {pausedCount} paused</>}
                  {quietCount > 0 && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="text-warn underline decoration-2 underline-offset-2 hover:no-underline"
                        onClick={() => setStatusFilter(statusFilter === "quiet" ? "all" : "quiet")}
                      >
                        {quietCount} quiet for {QUIET_DAYS / 30}+ months
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>&nbsp;</>
              )}
            </p>
          </div>
        </div>

        {/* Add a channel */}
        <form
          onSubmit={submitAdd}
          className="mb-6 flex flex-wrap items-center gap-2.5 border-2 border-ink bg-surface p-3.5 shadow-[4px_4px_0_var(--color-ink)]"
        >
          <input
            ref={inputRef}
            id="add"
            className="nb-input h-[42px] min-w-64 flex-1 px-3 text-sm"
            placeholder="Paste a channel URL or @handle, e.g. @mkbhd"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setPending(null);
            }}
            aria-label="Channel URL, @handle or name"
          />
          <select
            className="nb-input h-[42px] px-2.5 text-sm font-bold"
            value={addGenre}
            onChange={(e) => setAddGenre(e.target.value)}
            aria-label="Genre for the new channel"
          >
            <option value="">No genre</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <span
            className="ml-1 font-display text-[10.5px] tracking-widest text-ink/80"
            title="How far back to fetch uploads when the channel is added. After that, the sync keeps it fresh."
          >
            BACKFILL
          </span>
          <SegmentedControl
            label="How many years of uploads to fetch"
            value={years}
            onChange={setYears}
            options={["1", "2", "3", "4", "5"].map((y) => ({ value: y, label: `${y}Y` }))}
          />
          <Button type="submit" variant="primary" disabled={adding || !input.trim()} className="h-[42px]">
            <Icon name="plus" size={15} strokeWidth={3} />
            {adding ? "Adding…" : "Add"}
          </Button>
          {adding && !pending && (
            <p className="w-full text-xs font-bold text-muted-2">
              {addProgress ??
                `Fetching up to ${years} year${years === "1" ? "" : "s"} of uploads… a busy channel takes a few seconds.`}
            </p>
          )}
          {pending && (
            <div className="flex w-full flex-wrap items-center gap-3 border-2 border-ink bg-tint p-3">
              {pending.thumbnail && (
                <img
                  src={pending.thumbnail}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 rounded-full border-2 border-ink"
                />
              )}
              <p className="text-sm">
                Found <strong>{pending.title}</strong>
                {pending.handle && <span className="text-muted-2"> {pending.handle}</span>}. Is
                this the one?
              </p>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="primary" disabled={adding} onClick={() => doAdd(pending.ytChannelId)}>
                  {adding ? "Adding…" : "Yes, add it"}
                </Button>
                <Button size="sm" onClick={() => setPending(null)}>
                  No
                </Button>
              </div>
            </div>
          )}
        </form>

        {toast && (
          <div className="mb-5 border-2 border-ink bg-primary px-4 py-2 text-sm font-bold shadow-hard">{toast}</div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* The table */}
          <section className="min-w-0 flex-1 border-2 border-ink bg-surface shadow-hard">
            {/* Toolbar, or the bulk bar once anything is ticked. */}
            {working ? (
              <div className="flex items-center gap-3 bg-ink px-3.5 py-2.5 text-sm font-bold text-cream">
                <Icon name="refresh" size={15} className="animate-spin" />
                <span className="min-w-0 flex-1 truncate">{working}</span>
                {working.startsWith("Backfilling") && (
                  <button
                    type="button"
                    className="border-2 border-cream px-2.5 py-1 text-xs hover:bg-cream hover:text-ink"
                    onClick={() => (stopBackfill.current = true)}
                  >
                    Stop
                  </button>
                )}
              </div>
            ) : selected.size > 0 && confirmDelete ? (
              <div className="flex flex-wrap items-center gap-3 bg-ink px-3.5 py-2.5 text-sm text-cream">
                <span className="min-w-0 flex-1">
                  <strong>
                    Delete {plural(selected.size)} and their {selectedVideos.toLocaleString()} videos?
                  </strong>{" "}
                  Saved answers and notes on those videos go too. This can&apos;t be undone.
                </span>
                <BarButton danger onClick={() => deleteIds(selectedIds)}>
                  Delete {plural(selected.size)}
                </BarButton>
                <BarButton onClick={() => setConfirmDelete(false)}>Cancel</BarButton>
              </div>
            ) : selected.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2 bg-ink px-3.5 py-2.5 text-cream">
                <span className="mr-2 text-[13px] font-bold">{selected.size} selected</span>
                <label className="relative">
                  <span className="sr-only">Move to genre</span>
                  <select
                    className="cursor-pointer appearance-none border-2 border-cream bg-ink py-1 pl-2.5 pr-7 text-xs font-bold text-cream"
                    value=""
                    onChange={(e) => {
                      if (e.target.value === "") return;
                      moveTo(selectedIds, e.target.value === "none" ? null : Number(e.target.value));
                    }}
                  >
                    <option value="">Move to genre…</option>
                    {genres.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                    <option value="none">No genre</option>
                  </select>
                  <Icon name="chev" size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                </label>
                <label className="relative" title="Make sure every upload from the chosen years is here (fills gaps, reaches further back)">
                  <span className="sr-only">Backfill</span>
                  <select
                    className="cursor-pointer appearance-none border-2 border-cream bg-ink py-1 pl-2.5 pr-7 text-xs font-bold text-cream"
                    value=""
                    onChange={(e) => e.target.value && backfill(selectedIds, Number(e.target.value))}
                  >
                    <option value="">Backfill…</option>
                    {[1, 2, 3, 4, 5].map((y) => (
                      <option key={y} value={y}>
                        Last {y === 1 ? "year" : `${y} years`}
                      </option>
                    ))}
                  </select>
                  <Icon name="chev" size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                </label>
                {selectedRows.some((r) => r.channel.isActive) && (
                  <BarButton onClick={() => setPaused(selectedIds, true)}>Pause</BarButton>
                )}
                {selectedRows.some((r) => !r.channel.isActive) && (
                  <BarButton onClick={() => setPaused(selectedIds, false)}>Resume</BarButton>
                )}
                <span className="ml-auto flex gap-2">
                  <BarButton danger onClick={() => setConfirmDelete(true)}>
                    Delete…
                  </BarButton>
                  <button
                    type="button"
                    aria-label="Clear selection"
                    className="flex h-7 w-7 items-center justify-center hover:bg-cream hover:text-ink"
                    onClick={() => setSelected(new Set())}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink px-3.5 py-2.5">
                <label className="flex h-[34px] w-full max-w-xs items-center gap-2 border-2 border-ink bg-cream px-2.5">
                  <Icon name="search" size={14} className="text-muted-2" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                    placeholder="Find a channel"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                    aria-label="Find a channel by name or @handle"
                  />
                </label>
                <SegmentedControl
                  size="sm"
                  label="Show"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "all", label: "All" },
                    { value: "quiet", label: `Quiet ${quietCount}` },
                    { value: "paused", label: `Paused ${pausedCount}` },
                  ]}
                />
                <span className="ml-auto font-mono text-xs font-bold text-ink/80">
                  {visible.length === rows.length ? plural(rows.length) : `${visible.length} of ${rows.length}`}
                </span>
              </div>
            )}

            {/* Header row */}
            <div
              className={`${GRID} border-b-2 border-ink px-3.5 py-2 font-display text-[10.5px] tracking-widest text-ink/80`}
            >
              <Checkbox
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                label={allVisibleSelected ? "Unselect all shown" : "Select all shown"}
              />
              <SortHeader label="CHANNEL" k="name" sort={sort} onSort={sortBy} />
              <span className={WIDE}>GENRE</span>
              <SortHeader label="VIDEOS" k="videos" sort={sort} onSort={sortBy} className={WIDE} />
              <SortHeader label="LAST UPLOAD" k="last" sort={sort} onSort={sortBy} className={WIDE} />
              <span className={WIDE}>STATUS</span>
              <span />
            </div>

            {!loaded && <p className="px-4 py-8 text-center text-sm text-muted-2">Loading channels…</p>}
            {loaded && rows.length === 0 && (
              <div className="px-6 py-10 text-center">
                <p className="font-display text-lg">Add your first channel</p>
                <p className="mt-1 text-sm text-muted-2">
                  Paste a channel link or @handle above. TUBEBOX fetches its uploads and keeps them fresh.
                </p>
              </div>
            )}
            {loaded && rows.length > 0 && visible.length === 0 && (
              <div className="px-6 py-10 text-center">
                <p className="font-display text-lg">No channels match</p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setQuery("");
                    setGenreFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Show all channels
                </Button>
              </div>
            )}

            <ul>
              {visible.map((r) => {
                const on = selected.has(r.channel.id);
                const status = statusOf(r, now);
                const g = r.genre;
                return (
                  <li
                    key={r.channel.id}
                    // Clicking anywhere on a row (except its controls) ticks it.
                    onClick={(e) => {
                      if ((e.target as Element).closest("button, select, a, input, label")) return;
                      toggle(r.channel.id);
                    }}
                    className={`${GRID} cursor-pointer border-t-2 border-line-2 px-3.5 py-2.5 first:border-t-0 ${
                      on ? "bg-tint" : "hover:bg-cream"
                    }`}
                  >
                    <Checkbox checked={on} onChange={() => toggle(r.channel.id)} label={`Select ${r.channel.title}`} />
                    <div className={`flex min-w-0 items-center gap-3 ${r.channel.isActive ? "" : "opacity-55"}`}>
                      {r.channel.thumbnail ? (
                        <img
                          src={r.channel.thumbnail}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-8 w-8 shrink-0 rounded-full border-2 border-ink"
                        />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-line-2 text-[11px] font-bold">
                          {r.channel.title.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-bold leading-tight" title={r.channel.title}>
                          {r.channel.title}
                        </p>
                        <p className="truncate text-xs text-ink/70">{r.channel.handle ?? r.channel.ytChannelId}</p>
                        {/* Phones: the hidden columns, as one line. */}
                        <p className="mt-0.5 truncate text-xs font-bold text-ink/80 md:hidden">
                          {g?.name ?? "No genre"} · {r.videoCount + r.shortCount} videos ·{" "}
                          {r.lastUploadAt ? timeAgo(r.lastUploadAt) : "—"} ·{" "}
                          <span className={status.tone === "quiet" ? "text-warn" : ""}>{status.label}</span>
                        </p>
                      </div>
                    </div>
                    {/* Genre: a chip that's really a select, so changing one row is one click. */}
                    <label className="relative hidden min-w-0 max-w-full items-center justify-self-start border-2 border-ink bg-surface hover:bg-tint md:flex">
                      <span
                        className="pointer-events-none absolute left-2 h-2.5 w-2.5 border-[1.5px] border-ink"
                        style={{ backgroundColor: g?.color ?? "transparent" }}
                      />
                      <select
                        className="min-w-0 cursor-pointer appearance-none truncate bg-transparent py-1 pl-6 pr-6 text-xs font-bold outline-none"
                        value={r.channel.genreId ?? ""}
                        onChange={(e) => moveTo([r.channel.id], e.target.value ? Number(e.target.value) : null)}
                        aria-label={`Genre for ${r.channel.title}`}
                      >
                        <option value="">No genre</option>
                        {genres.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <Icon name="chev" size={12} className="pointer-events-none absolute right-1.5" />
                    </label>
                    <span className="hidden font-mono text-[13px] font-bold md:block">
                      {r.videoCount}
                      {r.shortCount > 0 && (
                        <span className="ml-1.5 text-[11px] font-normal text-ink/60">+{r.shortCount} shorts</span>
                      )}
                    </span>
                    <span className="hidden text-[12.5px] text-ink/75 md:block">
                      {r.lastUploadAt ? timeAgo(r.lastUploadAt) : "—"}
                    </span>
                    <span
                      className={`hidden items-center gap-1.5 text-[12.5px] font-bold md:flex ${
                        status.tone === "quiet" ? "text-warn" : status.tone === "paused" ? "text-ink/60" : ""
                      }`}
                    >
                      {status.tone === "paused" && <Icon name="pause" size={12} duotone={false} />}
                      <span className="flex flex-col items-start">
                        {status.label}
                        {/* Nothing in the window it was added with — likely a
                            channel that posts rarely. Offer to look further back. */}
                        {r.lastUploadAt == null && r.channel.isActive && (
                          <button
                            type="button"
                            disabled={!!working}
                            onClick={() => backfill([r.channel.id], 3)}
                            className="mt-0.5 text-[11px] font-bold text-ink underline decoration-2 underline-offset-2 hover:no-underline disabled:opacity-50"
                          >
                            Try backfilling 3 years
                          </button>
                        )}
                      </span>
                    </span>
                    <RowMenu
                      open={menuFor === r.channel.id}
                      onToggle={() => setMenuFor(menuFor === r.channel.id ? null : r.channel.id)}
                      onBackfill={(y) => backfill([r.channel.id], y)}
                      items={[
                        r.channel.isActive
                          ? { label: "Pause", onClick: () => setPaused([r.channel.id], true) }
                          : { label: "Resume", onClick: () => setPaused([r.channel.id], false) },
                        {
                          label: "Delete…",
                          danger: true,
                          // Same confirm step as bulk delete, for just this row.
                          onClick: () => {
                            setSelected(new Set([r.channel.id]));
                            setConfirmDelete(true);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          },
                        },
                      ]}
                      onPicked={() => setMenuFor(null)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Genres and Ask settings */}
          <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-[82px] lg:w-[300px] lg:shrink-0">
            <GenresPanel
              genres={genres}
              counts={genreCounts}
              filter={genreFilter}
              onFilter={setGenreFilter}
              onChanged={load}
              onError={setToast}
            />
            <AskSuggestionsEditor />
          </aside>
        </div>
      </div>
    </>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`flex h-[18px] w-[18px] items-center justify-center border-2 border-ink ${
        checked ? "bg-ink text-cream" : "bg-surface hover:bg-tint"
      }`}
    >
      {checked && <Icon name="check" size={12} strokeWidth={3.5} />}
    </button>
  );
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  k: SortKey;
  className?: string;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
}) {
  const on = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`items-center gap-1 text-left tracking-widest hover:text-ink ${on ? "text-ink" : ""} ${className || "flex"}`}
      aria-label={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      {on && <Icon name={sort.dir === 1 ? "chevUp" : "chev"} size={12} strokeWidth={3} />}
    </button>
  );
}

function BarButton({
  children,
  onClick,
  danger = false,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`border-2 px-2.5 py-1 text-xs font-bold ${
        danger
          ? "border-pink text-pink hover:bg-pink hover:text-ink"
          : "border-cream text-cream hover:bg-cream hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function RowMenu({
  open,
  onToggle,
  onBackfill,
  items,
  onPicked,
}: {
  open: boolean;
  onToggle: () => void;
  /** "Backfill" row: one button per year window. */
  onBackfill: (years: number) => void;
  items: { label: string; onClick: () => void; danger?: boolean }[];
  onPicked: () => void;
}) {
  return (
    <div className="relative justify-self-end" data-row-menu>
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex h-7 w-7 items-center justify-center border-2 ${
          open ? "border-ink bg-ink text-cream" : "border-transparent hover:border-ink"
        }`}
      >
        <Icon name="more" size={16} strokeWidth={4} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 border-2 border-ink bg-surface shadow-hard">
          <div className="border-b-2 border-line-2 px-3 py-2">
            <p className="text-sm font-bold">Backfill</p>
            <p className="text-[11px] text-ink/70">Fetch every upload from the last…</p>
            <div className="mt-1.5 flex">
              {[1, 2, 3, 4, 5].map((y, i) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    onPicked();
                    onBackfill(y);
                  }}
                  className={`flex-1 border-2 border-ink py-1 text-xs font-bold hover:bg-primary ${i > 0 ? "-ml-0.5" : ""}`}
                >
                  {y}Y
                </button>
              ))}
            </div>
          </div>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                onPicked();
                it.onClick();
              }}
              className={`block w-full px-3 py-2 text-left text-sm font-bold hover:bg-tint ${
                it.danger ? "text-danger" : ""
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
