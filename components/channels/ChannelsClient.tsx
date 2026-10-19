"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import TopBar from "@/components/TopBar";
import GenresPanel, { type GenreFilter } from "./GenresPanel";
import AskSuggestionsEditor from "./AskSuggestionsEditor";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { useDismiss } from "@/components/ui/useDismiss";
import PageTitle from "@/components/ui/PageTitle";
import Spinner from "@/components/ui/Spinner";
import SearchField from "@/components/ui/SearchField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { GenreItem } from "@/components/types";
import { notifyNavChanged } from "@/lib/nav-events";
import { api, rememberedReply } from "@/lib/api-client";
import AddChannelBar from "./AddChannelBar";
import ChannelRow from "./ChannelRow";
import {
  continueBackfill,
  GRID,
  isQuiet,
  plural,
  QUIET_DAYS,
  WIDE,
  type Row,
  type SortKey,
  type StatusFilter,
} from "./model";
import { BarButton, Checkbox, SortHeader } from "./TableParts";

/**
 * The Channels page (replaces Manage): add a channel on top; below, a dense
 * table of every channel with what it uploads and when, checkboxes for bulk
 * changes, and the genres panel on the right.
 */
export default function ChannelsClient() {
  // Coming back to Channels starts from the copies remembered in this tab
  // (instant), then refreshes (see lib/api-client.ts).
  const [seen] = useState(() => rememberedReply("/api/channels")?.channels as Row[] | undefined);
  const [rows, setRows] = useState<Row[]>(seen ?? []);
  const [genres, setGenres] = useState<GenreItem[]>(() => rememberedReply("/api/genres")?.genres ?? []);
  const [loaded, setLoaded] = useState(!!seen);
  // The message banner: usually text; the add bar's success also has a link.
  const [toast, setToast] = useState<ReactNode>(null);
  // Captured once per load, so "now" doesn't drift between rows.
  const [now, setNow] = useState(() => Date.now());

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

  const load = useCallback(async () => {
    // A failed refresh keeps what's on screen.
    const [channelsRes, genresRes] = await Promise.all([
      api("/api/channels").catch(() => null),
      api("/api/genres").catch(() => null),
    ]);
    if (channelsRes) setRows(channelsRes.channels ?? []);
    if (genresRes) setGenres(genresRes.genres ?? []);
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

  // Close the ⋯ menu on any outside click or Esc.
  useDismiss(menuFor != null, () => setMenuFor(null));

  // ---------- Changing one or many ----------

  /** One request for any number of channels (see /api/channels/bulk). */
  async function bulk(ids: number[], action: "move" | "pause" | "resume" | "delete", genreId?: number | null) {
    const data = await api("/api/channels/bulk", {
      method: "POST",
      body: { ids, action, genreId },
      fallback: "That didn't work. Please try again.",
    });
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
        recovered += await continueBackfill(
          id,
          years,
          null,
          (n) => setWorking(n > 0 ? `${step} · ${n} found` : step),
          () => stopBackfill.current
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
      if (sort.key === "genre") {
        // Grouped by genre (A→Z or Z→A), "No genre" always last, and A→Z
        // by channel inside each group — so the groups read like a list.
        if (!a.genre !== !b.genre) return a.genre ? -1 : 1;
        const byGenre = (a.genre?.name ?? "").localeCompare(b.genre?.name ?? "");
        return byGenre !== 0 ? d * byGenre : a.channel.title.localeCompare(b.channel.title);
      }
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
    // Names and genres start A→Z; numbers and dates start biggest/newest first.
    const alphabetical = key === "name" || key === "genre";
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: alphabetical ? 1 : -1 }));
  }

  return (
    <>
      <TopBar />
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 sm:px-8">
        {/* Title */}
        <PageTitle
          title="Channels"
          note="only the ones you chose"
          summary={
              loaded ? (
                <>
                  {plural(rows.length)}
                  {pausedCount > 0 && <> · {pausedCount} paused</>}
                  {quietCount > 0 && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="font-semibold text-warn underline decoration-2 underline-offset-2 hover:no-underline"
                        onClick={() => setStatusFilter(statusFilter === "quiet" ? "all" : "quiet")}
                      >
                        {quietCount} quiet for {QUIET_DAYS / 30}+ months
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>&nbsp;</>
              )
          }
        />

        <AddChannelBar genres={genres} onMessage={setToast} onAdded={load} />

        {toast && (
          <div role="status" className="mb-5 rounded-md border-[1.5px] border-ink bg-surface px-4 py-2 text-sm font-semibold">{toast}</div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* The table */}
          <section className="min-w-0 flex-1 rounded-lg border border-line bg-surface">
            {/* Toolbar, or the bulk bar once anything is ticked. */}
            {working ? (
              <div role="status" className="flex items-center gap-3 rounded-t-[9px] bg-ink px-4 py-2.5 text-sm font-semibold text-cream">
                <Icon name="spinner" size={15} className="animate-spin" />
                <span className="min-w-0 flex-1 truncate">{working}</span>
                {working.startsWith("Backfilling") && (
                  <button
                    type="button"
                    className="h-7 rounded-sm border border-cream/40 px-2.5 text-meta hover:bg-cream hover:text-ink"
                    onClick={() => (stopBackfill.current = true)}
                  >
                    Stop
                  </button>
                )}
              </div>
            ) : selected.size > 0 && confirmDelete ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-t-[9px] bg-ink px-4 py-2.5 text-sm text-cream">
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
              <div className="flex flex-wrap items-center gap-2 rounded-t-[9px] bg-ink px-4 py-2.5 text-cream">
                <span className="mr-2 text-meta font-semibold">{selected.size} selected</span>
                <label className="relative">
                  <span className="sr-only">Move to genre</span>
                  <select
                    className="h-7 cursor-pointer appearance-none rounded-sm border border-cream/40 bg-ink pl-2.5 pr-7 text-meta font-semibold text-cream hover:border-cream"
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
                    className="h-7 cursor-pointer appearance-none rounded-sm border border-cream/40 bg-ink pl-2.5 pr-7 text-meta font-semibold text-cream hover:border-cream"
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
                    className="flex h-7 w-7 items-center justify-center rounded-sm hover:bg-cream hover:text-ink"
                    onClick={() => setSelected(new Set())}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <SearchField
                  size="sm"
                  value={query}
                  onChange={setQuery}
                  placeholder="Find a channel"
                  label="Find a channel by name or @handle"
                  clearable={false}
                  className="w-full max-w-xs bg-cream!"
                />
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
                <span className="ml-auto font-mono text-xs text-muted">
                  {visible.length === rows.length ? plural(rows.length) : `${visible.length} of ${rows.length}`}
                </span>
              </div>
            )}

            {/* Header row */}
            <div
              className={`${GRID} border-b border-line px-4 py-2 label-caps`}
            >
              <Checkbox
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                label={allVisibleSelected ? "Unselect all shown" : "Select all shown"}
              />
              <SortHeader label="Channel" k="name" sort={sort} onSort={sortBy} />
              <SortHeader label="Genre" k="genre" sort={sort} onSort={sortBy} className={WIDE} />
              <SortHeader label="Videos" k="videos" sort={sort} onSort={sortBy} className={WIDE} />
              <SortHeader label="Last upload" k="last" sort={sort} onSort={sortBy} className={WIDE} />
              <span className={WIDE}>Status</span>
              <span />
            </div>

            {!loaded && <Spinner label="Loading channels…" className="flex justify-center px-4 py-8 text-sm text-muted" />}
            {loaded && rows.length === 0 && (
              <div className="px-6 py-10 text-center">
                <p className="font-display text-lg">Add your first channel</p>
                <p className="mt-1 text-sm text-muted">
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
              {visible.map((r) => (
                <ChannelRow
                  key={r.channel.id}
                  r={r}
                  now={now}
                  on={selected.has(r.channel.id)}
                  genres={genres}
                  working={!!working}
                  menuOpen={menuFor === r.channel.id}
                  onToggle={() => toggle(r.channel.id)}
                  onMove={(genreId) => moveTo([r.channel.id], genreId)}
                  onBackfill={(y) => backfill([r.channel.id], y)}
                  onPause={(pause) => setPaused([r.channel.id], pause)}
                  onDelete={() => {
                    setSelected(new Set([r.channel.id]));
                    setConfirmDelete(true);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onMenu={() => setMenuFor(menuFor === r.channel.id ? null : r.channel.id)}
                  onMenuPicked={() => setMenuFor(null)}
                />
              ))}
            </ul>
          </section>

          {/* Genres and Ask settings */}
          <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-[97px] lg:w-[300px] lg:shrink-0">
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
