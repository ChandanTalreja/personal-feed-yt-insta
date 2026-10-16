"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { SidebarItem, SidebarSection } from "./ui/SidebarList";
import type { GenreItem } from "./types";

export type View = "unwatched" | "later" | "watched" | "all";

export interface Facets {
  views: Record<View, number>;
  /** Count per genre id ("none" = channels without a genre). */
  genres: Record<string, number>;
}

export interface SidebarChannel {
  id: number;
  title: string;
  thumbnail: string | null;
  /** Everything stored for this channel, of the kind on screen. */
  count: number;
}

const VIEWS: [View, string][] = [
  ["unwatched", "Inbox"],
  ["later", "Later"],
  ["watched", "History"],
  ["all", "Everything"],
];

/** How many channels show before "Show all". */
const CHANNEL_PREVIEW = 8;

/** 1234 → "1.2k", so long counts don't push names off the sidebar. */
function short(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

/**
 * The feed's left sidebar: where you are (views), what about (genres) and
 * who from (channels). Every count is what clicking that row would show,
 * keeping your other choices. Channel counts are the exception: they're the
 * channel's whole archive of this kind, so they don't jump around.
 */
export default function FeedSidebar({
  view,
  onView,
  genres,
  genreId,
  onGenre,
  channels,
  channelIds,
  onToggleChannel,
  onClearChannels,
  facets,
}: {
  view: View;
  onView: (v: View) => void;
  genres: GenreItem[];
  genreId: number | null;
  onGenre: (id: number | null) => void;
  /** Channels in the current genre (all of them when no genre is picked). */
  channels: SidebarChannel[];
  channelIds: number[];
  onToggleChannel: (id: number) => void;
  onClearChannels: () => void;
  facets: Facets | null;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = q ? channels.filter((c) => c.title.toLowerCase().includes(q)) : channels;
  // Picked channels stay at the top so they're never hidden by "Show all".
  const ordered = [
    ...matches.filter((c) => channelIds.includes(c.id)),
    ...matches.filter((c) => !channelIds.includes(c.id)),
  ];
  const limited = q || showAll ? ordered : ordered.slice(0, CHANNEL_PREVIEW);
  const allGenresCount = facets
    ? Object.values(facets.genres).reduce((a, b) => a + b, 0)
    : undefined;

  return (
    <nav aria-label="Feed filters" className="text-ink">
      <SidebarSection title="VIEWS">
        {VIEWS.map(([value, label]) => (
          <SidebarItem
            key={value}
            label={label}
            active={view === value}
            count={facets ? short(facets.views[value]) : undefined}
            onClick={() => onView(value)}
          />
        ))}
      </SidebarSection>

      <SidebarSection title="GENRES">
        <SidebarItem
          label="All genres"
          active={genreId == null}
          count={allGenresCount != null ? short(allGenresCount) : undefined}
          onClick={() => onGenre(null)}
          leading={<span className="h-2.5 w-2.5 shrink-0 border-[1.5px] border-ink bg-ink" />}
        />
        {genres.map((g) => (
          <SidebarItem
            key={g.id}
            label={g.name}
            active={genreId === g.id}
            count={facets ? short(facets.genres[g.id] ?? 0) : undefined}
            onClick={() => onGenre(g.id)}
            leading={
              <span
                className="h-2.5 w-2.5 shrink-0 border-[1.5px] border-ink"
                style={{ backgroundColor: g.color }}
              />
            }
          />
        ))}
      </SidebarSection>

      <SidebarSection
        title="CHANNELS"
        aside={
          channelIds.length > 0 ? (
            <button
              type="button"
              onClick={onClearChannels}
              className="text-[11px] font-bold text-warn hover:underline"
            >
              Clear {channelIds.length}
            </button>
          ) : undefined
        }
      >
        <li className="px-3 pb-2">
          <input
            className="w-full border-2 border-ink bg-cream px-2 py-1 text-xs outline-none placeholder:text-muted focus:shadow-[2px_2px_0_var(--color-primary)]"
            placeholder="Filter channels"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            aria-label="Filter channels"
          />
          {q && (
            <p className="mt-1 font-mono text-[11px] text-muted-2">
              {matches.length} of {channels.length} · Esc clears
            </p>
          )}
        </li>
        {limited.length === 0 && (
          <li className="px-4 py-2 text-xs text-muted-2">
            {q ? "No channels match." : "No channels in this genre yet."}
          </li>
        )}
        {limited.map((c) => (
          <SidebarItem
            key={c.id}
            label={c.title}
            active={channelIds.includes(c.id)}
            count={c.count > 0 ? short(c.count) : undefined}
            onClick={() => onToggleChannel(c.id)}
            leading={
              c.thumbnail ? (
                <img
                  src={c.thumbnail}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-ink"
                />
              ) : (
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-line-2 text-[9px] font-bold">
                  {c.title.slice(0, 2).toUpperCase()}
                </span>
              )
            }
          />
        ))}
        {!q && ordered.length > CHANNEL_PREVIEW && (
          <li className="px-4 pt-1.5">
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="text-[13px] font-bold text-warn hover:underline"
            >
              {showAll ? "Show fewer" : `Show all ${ordered.length} →`}
            </button>
          </li>
        )}
      </SidebarSection>
    </nav>
  );
}
