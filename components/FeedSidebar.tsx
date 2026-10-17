"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import Icon, { type IconName } from "./ui/Icon";
import { SidebarItem, SidebarSection, SidebarTile } from "./ui/SidebarList";
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

/** The four views, each with its soft colour tile (REDESIGN §2 v2). */
const VIEWS: [View, string, IconName, string][] = [
  ["unwatched", "Inbox", "inbox", "bg-tile-yellow"],
  ["later", "Watch later", "later", "bg-tile-pink"],
  ["watched", "Watched", "watched", "bg-tile-green"],
  ["all", "Everything", "everything", "bg-tile-blue"],
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
      <SidebarSection title="Your feed">
        {VIEWS.map(([value, label, icon, tile]) => (
          <SidebarItem
            key={value}
            label={label}
            leading={
              <SidebarTile className={tile}>
                <Icon name={icon} size={15} duotone={false} />
              </SidebarTile>
            }
            active={view === value}
            count={facets ? short(facets.views[value]) : undefined}
            onClick={() => onView(value)}
          />
        ))}
      </SidebarSection>

      <SidebarSection title="Genres">
        <SidebarItem
          label="All genres"
          active={genreId == null}
          count={allGenresCount != null ? short(allGenresCount) : undefined}
          onClick={() => onGenre(null)}
          leading={<span className="h-[9px] w-[9px] shrink-0 rounded-[3px] bg-ink" />}
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
                className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
                style={{ backgroundColor: g.color }}
              />
            }
          />
        ))}
      </SidebarSection>

      <SidebarSection
        title="Channels"
        aside={
          channelIds.length > 0 ? (
            <button
              type="button"
              onClick={onClearChannels}
              className="text-xs font-semibold text-muted hover:text-ink hover:underline"
            >
              Clear {channelIds.length}
            </button>
          ) : undefined
        }
      >
        <li className="px-1 pb-1.5">
          <label className="relative block">
            <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="nb-input h-8 w-full rounded-sm pl-8 pr-2 text-meta"
            placeholder="Filter channels"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            aria-label="Filter channels"
          />
          </label>
          {q && (
            <p className="mt-1 px-1 font-mono text-xs text-muted">
              {matches.length} of {channels.length} · Esc clears
            </p>
          )}
        </li>
        {limited.length === 0 && (
          <li className="px-2.5 py-2 text-meta text-muted">
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
                  className="h-[22px] w-[22px] shrink-0 rounded-full bg-line"
                />
              ) : (
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-line text-xs font-bold tracking-tighter">
                  {c.title.slice(0, 2).toUpperCase()}
                </span>
              )
            }
          />
        ))}
        {!q && ordered.length > CHANNEL_PREVIEW && (
          <li className="px-2.5 pt-1.5">
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="inline-flex items-center gap-1.5 text-meta font-semibold hover:underline"
            >
              {showAll ? "Fewer channels" : `All ${ordered.length} channels`}
              <Icon name={showAll ? "chevUp" : "arrowRight"} size={13} />
            </button>
          </li>
        )}
      </SidebarSection>
    </nav>
  );
}
