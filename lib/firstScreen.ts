import type { Db } from "./db";
import { getAskSuggestions } from "./askSuggestions";
import { listChannels } from "./channels";
import { listFeedVideos, type FeedQuery } from "./feedVideos";
import { listGenres } from "./genres";
import { navSummary } from "./nav";

// Audit B1: the Feed and Podcasts pages send their first screen inside the
// page itself. Before, the page arrived empty and then made 5 requests
// (videos, top bar counts, channels, genres, Ask suggestions); after idle
// each one woke its own Netlify instance (6 cold starts per open, measured
// 2026-10-22: cards at 8.2 s). Now the page's own request gathers them, in
// parallel, with the same functions the API routes use.

/** The default view a page opens on: Inbox, videos, no filters. */
export function openingQuery(section: "feed" | "podcasts"): FeedQuery {
  return {
    section,
    kind: "videos",
    watched: "unwatched",
    genreId: null,
    channelIds: [],
    page: 0,
    search: "",
    length: "any",
    ids: false,
    continueListening: false,
  };
}

/**
 * Everything the page's first screen needs, shaped exactly like the API
 * replies (a JSON round trip turns dates into the same strings), plus when
 * it was made, so the browser only trusts it while it's fresh.
 */
export async function loadFirstScreen(db: Db, section: "feed" | "podcasts") {
  const started = performance.now();
  const [feed, nav, channels, genres, suggestions, continued] = await Promise.all([
    listFeedVideos(db, openingQuery(section)),
    navSummary(db),
    listChannels(db),
    listGenres(db),
    getAskSuggestions(db),
    section === "podcasts"
      ? listFeedVideos(db, { ...openingQuery(section), continueListening: true })
      : null,
  ]);
  // One line per gathered first screen: how long the page's own data took
  // (and proof of when it runs: on open and on navigation, not on prefetch).
  console.log(`[first-screen] ${section} in ${Math.round(performance.now() - started)}ms`);
  return JSON.parse(
    JSON.stringify({
      renderedAt: Date.now(),
      section,
      feed,
      nav,
      channels: { channels },
      genres: { genres },
      suggestions: { suggestions },
      continued,
    })
  );
}
