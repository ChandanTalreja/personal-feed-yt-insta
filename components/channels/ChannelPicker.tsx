"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { Avatar, Thumb } from "@/components/ui/Media";
import SearchField from "@/components/ui/SearchField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Spinner from "@/components/ui/Spinner";
import type { GenreItem } from "@/components/types";
import { api } from "@/lib/api-client";
import { formatDuration, timeAgo } from "@/lib/format";
import { looseMatcher } from "@/lib/looseMatch";

/**
 * What's being picked from: a channel (found by the add bar, or "Pick more"
 * on a picked row), or a pasted playlist link (FEAT-25).
 */
export interface PickTarget {
  /** The channel, when picking from one. */
  ytChannelId?: string;
  /** The playlist, when picking from one. */
  playlist?: { id: string; count: number; channelTitle: string };
  title: string;
  handle: string | null;
  thumbnail: string | null;
  genreId: number | null;
  section: "feed" | "podcasts";
  /** How far back a channel's list goes, from the add bar (1–5). */
  years: number;
  /** "Pick more" on a channel already picked. */
  more: boolean;
}

/** What a save did, for the page's toast. */
export interface PickResult {
  picked: number;
  added: number;
  channels: { id: number; title: string; section: string }[];
  track: { id: number; name: string } | null;
}

interface PickItem {
  ytVideoId: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number;
  publishedAt: string;
  isLive: boolean;
  isShort: boolean;
  channelTitle: string;
  have: boolean;
}

type Kind = "videos" | "shorts";

interface ListState {
  items: PickItem[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: ListState = { items: [], cursor: null, loading: true, error: null };

/** The most videos one save takes (lib/pick.ts MAX_PICK). */
const MAX_PICK = 100;

/**
 * Pick videos instead of following a channel (FEAT-22). From a channel: its
 * uploads from the chosen years, Videos and Shorts on separate tabs
 * (Podcasts: long videos only, no switch), ticked in any order. From a
 * playlist (FEAT-25): its videos in its own order, all ticked to start,
 * with "Also make a track from it". Only the ticked ones are stored.
 */
export default function ChannelPicker({
  target,
  genres,
  onDone,
  onCancel,
  onPickGenre,
}: {
  target: PickTarget;
  genres: GenreItem[];
  onDone: (result: PickResult) => void;
  onCancel: () => void;
  /** "No genre picked": take me to the add bar's genre box. */
  onPickGenre: () => void;
}) {
  const podcasts = target.section === "podcasts";
  const playlist = target.playlist ?? null;
  const [kind, setKind] = useState<Kind>("videos");
  const [years, setYears] = useState(String(target.years));
  // One list per tab and window, kept while the picker is open.
  const [lists, setLists] = useState<Record<string, ListState>>({});
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [makeTrack, setMakeTrack] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = playlist ? "playlist" : `${kind}:${years}`;
  const list = lists[key] ?? EMPTY;

  async function loadPage(listKey: string, cursor: string | null) {
    setLists((l) => ({ ...l, [listKey]: { ...(l[listKey] ?? EMPTY), loading: true, error: null } }));
    try {
      const params = new URLSearchParams();
      if (playlist) {
        params.set("playlist", playlist.id);
        params.set("section", target.section);
      } else {
        const [k, y] = listKey.split(":");
        params.set("channel", target.ytChannelId ?? "");
        params.set("kind", k);
        params.set("years", y);
      }
      if (cursor) params.set("cursor", cursor);
      const data = await api(`/api/channels/pick?${params}`, { fallback: "Couldn't list these videos" });
      const items: PickItem[] = data.items;
      setLists((l) => ({
        ...l,
        [listKey]: {
          items: [...(cursor ? (l[listKey]?.items ?? []) : []), ...items],
          cursor: data.cursor,
          loading: false,
          error: null,
        },
      }));
      // A playlist starts all ticked: you pasted it because you want it.
      if (playlist) {
        setTicked((t) => new Set([...t, ...items.map((v) => v.ytVideoId)]));
      }
    } catch (err) {
      setLists((l) => ({ ...l, [listKey]: { ...(l[listKey] ?? EMPTY), loading: false, error: (err as Error).message } }));
    }
  }

  // First page of a list the first time it's shown.
  useEffect(() => {
    if (lists[key]) return;
    loadPage(key, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Same loose matching as the rest of the app: "hash map" finds "HashMap".
  const matches = looseMatcher(query.trim());
  const shown = matches ? list.items.filter((v) => matches(v.title)) : list.items;
  const genre = genres.find((g) => g.id === target.genreId);
  // From a channel, what you already have can't be unticked; from a
  // playlist it can (it's still there to go into Picked and the track).
  const locked = (v: PickItem) => v.have && !playlist;
  const tooMany = ticked.size > MAX_PICK;

  function toggle(id: string) {
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (ticked.size === 0 || saving || tooMany) return;
    setSaving(true);
    setError(null);
    // A playlist keeps its own order (the track's order too).
    const ids = playlist ? list.items.map((v) => v.ytVideoId).filter((id) => ticked.has(id)) : [...ticked];
    try {
      const data = await api("/api/channels/pick", {
        method: "POST",
        body: {
          ytVideoIds: ids,
          genreId: target.genreId,
          section: target.section,
          trackName: playlist && makeTrack ? target.title : null,
        },
        fallback: "Couldn't add those videos",
      });
      onDone({ picked: ids.length, added: data.added, channels: data.channels, track: data.track });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={`Pick from ${target.title}`}
      className="mb-6 overflow-hidden rounded-lg border-[1.5px] border-ink bg-surface"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-4">
        {playlist ? (
          <Thumb src={target.thumbnail} className="w-16 shrink-0 rounded-sm" />
        ) : (
          <Avatar src={target.thumbnail} name={target.title} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg leading-tight">
            {target.more ? "Pick more from" : "Pick from"} {target.title}
          </h2>
          <p className="text-meta text-muted">
            {playlist ? (
              <>
                Playlist by {playlist.channelTitle} · {playlist.count} video{playlist.count === 1 ? "" : "s"}. All ticked:
                untick the ones you don&apos;t want.
              </>
            ) : (
              <>
                {target.handle && <>{target.handle} · </>}
                Only the videos you tick are added. It&apos;s never checked for new ones.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onCancel}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-muted hover:bg-ink/5 hover:text-ink"
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        {/* A channel's Videos and Shorts (Podcasts never hold Shorts, FEAT-14);
            a playlist is one list in its own order. */}
        {!playlist && !podcasts && (
          <SegmentedControl
            size="sm"
            label="Videos or Shorts"
            value={kind}
            onChange={setKind}
            options={[
              { value: "videos", label: "Videos" },
              { value: "shorts", label: "Shorts" },
            ]}
          />
        )}
        {!playlist && (
          <>
            <span className="ml-1 label-caps">Uploads from</span>
            <SegmentedControl
              size="sm"
              label="How many years of uploads to list"
              value={years}
              onChange={setYears}
              options={["1", "2", "3", "4", "5"].map((y) => ({ value: y, label: `${y}Y` }))}
            />
          </>
        )}
        <SearchField
          size="sm"
          value={query}
          onChange={setQuery}
          placeholder="Filter by title"
          label="Filter these videos by title"
          className="ml-auto w-full max-w-xs bg-cream!"
        />
      </div>

      <ul className="max-h-[460px] overflow-y-auto border-t border-line">
        {shown.map((v) => {
          const on = locked(v) || ticked.has(v.ytVideoId);
          return (
            <li key={v.ytVideoId} className="border-t border-line first:border-t-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={locked(v)}
                onClick={() => toggle(v.ytVideoId)}
                className={`grid w-full grid-cols-[20px_96px_minmax(0,1fr)] items-center gap-3 px-4 py-2 text-left ${
                  locked(v) ? "cursor-default" : on ? "bg-primary/20" : "hover:bg-ink/[0.03]"
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border ${
                    on ? "border-ink bg-ink text-cream" : "border-muted/60 bg-surface"
                  } ${locked(v) ? "opacity-40" : ""}`}
                >
                  {on && <Icon name="check" size={12} />}
                </span>
                <span className="relative">
                  <Thumb src={v.thumbnail} lazy className="w-24 rounded-sm" />
                  <span className="absolute bottom-1 right-1 rounded-xs bg-black/75 px-1 font-mono text-[11px] leading-4 text-white">
                    {formatDuration(v.durationSeconds)}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold" title={v.title}>
                    {v.title}
                  </span>
                  <span className="block truncate text-meta text-muted">
                    {playlist && <>{v.channelTitle} · </>}
                    {timeAgo(v.publishedAt)}
                    {playlist && v.isShort && " · Short"}
                    {v.isLive && " · Live stream"}
                    {v.have && <span className="font-semibold text-ink"> · {playlist ? "Already in TUBEBOX" : "Added"}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {list.loading && (
          <li className="flex justify-center px-4 py-6">
            <Spinner label="Listing videos…" className="text-sm text-muted" />
          </li>
        )}
        {!list.loading && list.error && (
          <li className="px-4 py-6 text-center text-sm">
            {list.error}{" "}
            <Button size="sm" className="ml-2" onClick={() => loadPage(key, list.cursor)}>
              Try again
            </Button>
          </li>
        )}
        {!list.loading && !list.error && shown.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            {query.trim()
              ? `Nothing loaded matches “${query.trim()}”.`
              : playlist
                ? "Nothing in this playlist can be added."
                : `No ${kind === "shorts" ? "Shorts" : "videos"} in the last ${years === "1" ? "year" : `${years} years`}.`}
          </li>
        )}
        {!list.loading && !list.error && list.cursor && (
          <li className="flex justify-center border-t border-line px-4 py-3">
            <Button size="sm" onClick={() => loadPage(key, list.cursor)}>
              {playlist ? "Show more" : "Show older"}
            </Button>
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t-[1.5px] border-ink bg-cream px-4 py-3">
        <div className="min-w-0 flex-1 text-meta text-muted">
          <p>
            <span className="font-mono font-semibold text-ink">{ticked.size}</span> ticked
            {target.more ? (
              "."
            ) : genre ? (
              <>
                , into{" "}
                <strong className="text-ink underline decoration-primary decoration-[3px] underline-offset-2 [text-decoration-skip-ink:none]">
                  {genre.name}
                </strong>{" "}
                in {podcasts ? "Podcasts" : "the Feed"}.
              </>
            ) : (
              // No genre chosen: say so gently, and offer the way to choose one.
              <>
                , into {podcasts ? "Podcasts" : "the Feed"}.{" "}
                <button
                  type="button"
                  onClick={onPickGenre}
                  className="font-semibold text-ink underline decoration-primary decoration-[3px] underline-offset-2 [text-decoration-skip-ink:none] hover:decoration-ink"
                >
                  No genre picked
                </button>
                , so they&apos;ll sit under No genre.
              </>
            )}
          </p>
          {playlist && (
            <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 text-ink">
              <input
                type="checkbox"
                checked={makeTrack}
                onChange={(e) => setMakeTrack(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-ink"
              />
              Also make a track from it
              <span className="text-muted">(“{target.title.length > 40 ? `${target.title.slice(0, 40)}…` : target.title}”, in this order)</span>
            </label>
          )}
          {tooMany && (
            <p className="mt-1 font-semibold text-danger">
              Add up to {MAX_PICK} at a time: untick some, or add these in two goes.
            </p>
          )}
          {error && <p className="mt-1 font-semibold text-danger">{error}</p>}
        </div>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={ticked.size === 0 || tooMany}
          busy={saving}
          busyLabel="Adding…"
          onClick={save}
        >
          {ticked.size === 0 ? "Tick a video" : `Add ${ticked.size} video${ticked.size === 1 ? "" : "s"}`}
        </Button>
      </div>
    </section>
  );
}
