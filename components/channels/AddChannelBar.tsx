import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { Avatar, Thumb } from "@/components/ui/Media";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { GenreItem } from "@/components/types";
import { api } from "@/lib/api-client";
import { notifyNavChanged } from "@/lib/nav-events";
import { readYouTubeLink } from "@/lib/youtubeLinks";
import type { PickTarget } from "./ChannelPicker";
import { continueBackfill, isExactInput } from "./model";

interface ResolvedPreview {
  ytChannelId: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
}

/** What a pasted video or playlist link points at (GET /api/channels/link). */
interface LinkFound {
  video: {
    ytVideoId: string;
    title: string;
    thumbnail: string | null;
    channelTitle: string;
    isShort: boolean;
    /** Already here: in Picked, or in the feed (a followed channel). */
    stored: "picked" | "feed" | null;
  } | null;
  playlist: { id: string; title: string; channelTitle: string; count: number; thumbnail: string | null } | null;
}

/**
 * The Channels page's add bar: paste a URL or @handle (added straight away),
 * or type a name (found by search, then confirmed). Fetches 1–5 years of
 * uploads, carrying on past Netlify's 10 s limit when a channel is busy.
 *
 * Switched to Pick (FEAT-22), it adds nothing itself: the found channel goes
 * to the picker, which lists its uploads from the chosen years to tick.
 *
 * A pasted video or playlist link (FEAT-25), whichever the switch says: a
 * video asks "Add it to Picked?"; a playlist opens the picker with all its
 * videos ticked; a video opened from a playlist asks which of the two.
 */
export default function AddChannelBar({
  genres,
  onMessage,
  onAdded,
  onPick,
  onGenreChange,
}: {
  /** Pick mode: open the picker for this channel (or a pasted playlist). */
  onPick: (target: PickTarget) => void;
  /** The genre box changed, so an open picker can follow it. */
  onGenreChange: (genreId: number | null) => void;
  genres: GenreItem[];
  /** A result or error, for the page's message banner. */
  onMessage: (message: ReactNode) => void;
  /** A channel was added: reload the table. */
  onAdded: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [addGenre, setAddGenre] = useState("");
  // Its home: the Feed or Podcasts (FEAT-14).
  const [addSection, setAddSection] = useState<"feed" | "podcasts">("feed");
  const [years, setYears] = useState("1");
  // Follow every upload (as always), or pick only some (FEAT-22).
  const [mode, setMode] = useState<"follow" | "pick">("follow");
  const picking = mode === "pick";
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<ResolvedPreview | null>(null);
  // A pasted video or playlist link, waiting for a yes (FEAT-25).
  const [linkFound, setLinkFound] = useState<LinkFound | null>(null);
  // While a just-added channel is still fetching older uploads.
  const [addProgress, setAddProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || adding) return;
    // A video or playlist link, whichever the switch says (FEAT-25).
    if (readYouTubeLink(input)) {
      setAdding(true);
      try {
        const data: LinkFound = await api(`/api/channels/link?input=${encodeURIComponent(input.trim())}`, {
          fallback: "Couldn't read that link",
        });
        // Just a playlist: straight to the list.
        if (!data.video && data.playlist) openPlaylist(data.playlist);
        else setLinkFound(data);
      } catch (err) {
        onMessage((err as Error).message);
      } finally {
        setAdding(false);
      }
      return;
    }
    // Plain names resolve via search, which can guess wrong — preview the
    // match and ask for confirmation instead of adding straight away. Pick
    // mode resolves an exact @handle too: the picker needs its channel id.
    if (picking || !isExactInput(input)) {
      setAdding(true);
      try {
        const data = await api(`/api/channels/resolve?input=${encodeURIComponent(input.trim())}`, {
          fallback: "Couldn't find that channel",
        });
        if (picking && isExactInput(input)) openPicker(data.channel);
        else setPending(data.channel);
      } catch (err) {
        onMessage((err as Error).message);
      } finally {
        setAdding(false);
      }
      return;
    }
    await doAdd(input);
  }

  function openPicker(channel: ResolvedPreview) {
    onPick({
      ...channel,
      genreId: addGenre ? Number(addGenre) : null,
      section: addSection,
      years: Number(years),
      more: false,
    });
    setInput("");
    setPending(null);
  }

  function openPlaylist(playlist: NonNullable<LinkFound["playlist"]>) {
    onPick({
      playlist: { id: playlist.id, count: playlist.count, channelTitle: playlist.channelTitle },
      title: playlist.title,
      handle: null,
      thumbnail: playlist.thumbnail,
      genreId: addGenre ? Number(addGenre) : null,
      section: addSection,
      years: Number(years),
      more: false,
    });
    setInput("");
    setLinkFound(null);
  }

  /** One video from a link, straight into Picked. */
  async function addVideo(video: NonNullable<LinkFound["video"]>) {
    setAdding(true);
    try {
      await api("/api/channels/pick", {
        method: "POST",
        body: { ytVideoIds: [video.ytVideoId], genreId: addGenre ? Number(addGenre) : null, section: addSection },
        fallback: "Couldn't add the video",
      });
      onMessage(
        <>
          Added <strong>{video.title}</strong> to Picked.{" "}
          <Link
            href={`${addSection === "podcasts" ? "/podcasts" : "/"}?view=picked`}
            className="whitespace-nowrap underline decoration-primary decoration-2 underline-offset-2 hover:decoration-ink"
          >
            See it →
          </Link>
        </>
      );
      setInput("");
      setLinkFound(null);
      await onAdded();
      notifyNavChanged();
    } catch (err) {
      onMessage((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function doAdd(value: string) {
    setAdding(true);
    try {
      const data = await api("/api/channels", {
        method: "POST",
        body: {
          input: value,
          genreId: addGenre ? Number(addGenre) : null,
          section: addSection,
          years: Number(years),
        },
        fallback: "Couldn't add the channel",
      });
      const y = Math.round((data.backfillMonths ?? 12) / 12);
      let added: number = data.videosAdded;
      // A busy channel with a deep window doesn't fit one request: carry on
      // from where the server stopped until it's all fetched.
      if (data.cursor) {
        // Adding has no Stop button, so it never stops early (a Stop pressed
        // on an earlier backfill must not cut a new channel short).
        added += await continueBackfill(data.channel.id, y, data.cursor, (n) =>
          setAddProgress(`Fetching older uploads… ${added + n} so far`)
        );
      }
      onMessage(
        <>
          Added {data.channel.title}, with {added} video{added === 1 ? "" : "s"} from the last{" "}
          {y === 1 ? "year" : `${y} years`}.{" "}
          {/* The one moment you'd want to jump: its page (Feed or Podcasts),
              filtered to the new channel. */}
          <Link
            href={`${data.channel.section === "podcasts" ? "/podcasts" : "/"}?channel=${data.channel.id}`}
            className="whitespace-nowrap underline decoration-primary decoration-2 underline-offset-2 hover:decoration-ink"
          >
            See its videos →
          </Link>
        </>
      );
      setInput("");
      setPending(null);
      await onAdded();
      notifyNavChanged();
    } catch (err) {
      onMessage((err as Error).message);
    } finally {
      setAdding(false);
      setAddProgress(null);
    }
  }

  return (
    <form
      onSubmit={submitAdd}
      className="mb-6 flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-surface p-4"
    >
      <input
        ref={inputRef}
        id="add"
        className="field h-10 min-w-64 flex-1 px-3 text-sm"
        placeholder="A channel, @handle, video or playlist link"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setPending(null);
          setLinkFound(null);
        }}
        aria-label="Channel URL, @handle, name, or a video or playlist link"
      />
      <select
        id="add-genre"
        className="field h-10 cursor-pointer px-2.5 text-sm font-semibold"
        value={addGenre}
        onChange={(e) => {
          setAddGenre(e.target.value);
          onGenreChange(e.target.value ? Number(e.target.value) : null);
        }}
        aria-label="Genre for the new channel"
      >
        <option value="">No genre</option>
        {genres.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <select
        className="field h-10 cursor-pointer px-2.5 text-sm font-semibold"
        value={addSection}
        onChange={(e) => setAddSection(e.target.value === "podcasts" ? "podcasts" : "feed")}
        aria-label="Where the new channel's videos go"
      >
        <option value="feed">Feed</option>
        <option value="podcasts">Podcasts</option>
      </select>
      <SegmentedControl
        label="Follow every upload, or pick only some videos"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setPending(null);
          setLinkFound(null);
        }}
        options={[
          { value: "follow", label: "Follow" },
          { value: "pick", label: "Pick" },
        ]}
      />
      <span
        className="ml-1 label-caps"
        title={
          picking
            ? "How far back the list of uploads to pick from goes."
            : "How far back to fetch uploads when the channel is added. After that, the sync keeps it fresh."
        }
      >
        {picking ? "Uploads from" : "Backfill"}
      </span>
      <SegmentedControl
        label={picking ? "How many years of uploads to list" : "How many years of uploads to fetch"}
        value={years}
        onChange={setYears}
        options={["1", "2", "3", "4", "5"].map((y) => ({ value: y, label: `${y}Y` }))}
      />
      <Button type="submit" variant="primary" size="sm" disabled={!input.trim()} busy={adding} busyLabel={picking ? "Finding…" : "Adding…"} className="h-10 px-4">
        {picking ? (
          "Show videos"
        ) : (
          <>
            <Icon name="plus" size={15} />
            Add
          </>
        )}
      </Button>
      {adding && !pending && !picking && !readYouTubeLink(input) && (
        <p className="w-full text-meta text-muted">
          {addProgress ??
            `Fetching up to ${years} year${years === "1" ? "" : "s"} of uploads… a busy channel takes a few seconds.`}
        </p>
      )}
      {pending && (
        <div className="flex w-full flex-wrap items-center gap-3 rounded-md border-[1.5px] border-ink bg-cream p-3">
          {pending.thumbnail && <Avatar src={pending.thumbnail} name={pending.title} size={40} />}
          <p className="text-sm">
            Found <strong>{pending.title}</strong>
            {pending.handle && <span className="text-muted"> {pending.handle}</span>}. Is
            this the one?
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="primary"
              busy={adding}
              busyLabel="Adding…"
              onClick={() => (picking ? openPicker(pending) : doAdd(pending.ytChannelId))}
            >
              {picking ? "Yes, show its videos" : "Yes, add it"}
            </Button>
            <Button size="sm" onClick={() => setPending(null)}>
              No
            </Button>
          </div>
        </div>
      )}
      {linkFound?.video && (
        <LinkQuestion
          found={linkFound}
          podcasts={addSection === "podcasts"}
          adding={adding}
          onVideo={() => linkFound.video && addVideo(linkFound.video)}
          onPlaylist={() => linkFound.playlist && openPlaylist(linkFound.playlist)}
          onCancel={() => setLinkFound(null)}
        />
      )}
    </form>
  );
}

/**
 * The question for a pasted video link (FEAT-25): "Add it to Picked?", or,
 * for a video opened from a playlist, "This video or the whole playlist?".
 */
function LinkQuestion({
  found,
  podcasts,
  adding,
  onVideo,
  onPlaylist,
  onCancel,
}: {
  found: LinkFound;
  podcasts: boolean;
  adding: boolean;
  onVideo: () => void;
  onPlaylist: () => void;
  onCancel: () => void;
}) {
  const video = found.video!;
  const playlist = found.playlist;
  const name = <strong>{video.title}</strong>;
  const by = (
    <>
      {" "}
      by <strong>{video.channelTitle}</strong>
    </>
  );

  let text: ReactNode;
  let actions: ReactNode;
  if (playlist) {
    text = (
      <>
        {name}
        {by} is part of the playlist <strong>{playlist.title}</strong> ({playlist.count} video
        {playlist.count === 1 ? "" : "s"}). Add this video, or the whole playlist?
      </>
    );
    actions = (
      <>
        <Button size="sm" variant="primary" onClick={onPlaylist}>
          The whole playlist
        </Button>
        <Button size="sm" busy={adding} busyLabel="Adding…" onClick={onVideo} disabled={video.isShort && podcasts}>
          This video
        </Button>
      </>
    );
  } else if (video.stored === "picked") {
    text = <>{name} is already in Picked.</>;
    actions = null;
  } else if (video.isShort && podcasts) {
    // Podcasts never hold Shorts (FEAT-14).
    text = <>{name} is a Short, and Podcasts don&apos;t hold Shorts. Switch the bar to Feed to add it.</>;
    actions = null;
  } else {
    text = (
      <>
        Found {name}
        {by}.{video.stored === "feed" ? " It's already in your feed." : ""} Add it to Picked?
      </>
    );
    actions = (
      <Button size="sm" variant="primary" busy={adding} busyLabel="Adding…" onClick={onVideo}>
        Yes, add it
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-3 rounded-md border-[1.5px] border-ink bg-cream p-3">
      <Thumb src={video.thumbnail} className="w-20 shrink-0 rounded-sm" />
      <p className="min-w-0 flex-1 text-sm">{text}</p>
      <div className="ml-auto flex gap-2">
        {actions}
        <Button size="sm" onClick={onCancel}>
          {actions ? "No" : "OK"}
        </Button>
      </div>
    </div>
  );
}
