import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Media";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { GenreItem } from "@/components/types";
import { api } from "@/lib/api-client";
import { notifyNavChanged } from "@/lib/nav-events";
import { continueBackfill, isExactInput } from "./model";

interface ResolvedPreview {
  ytChannelId: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
}

/**
 * The Channels page's add bar: paste a URL or @handle (added straight away),
 * or type a name (found by search, then confirmed). Fetches 1–5 years of
 * uploads, carrying on past Netlify's 10 s limit when a channel is busy.
 */
export default function AddChannelBar({
  genres,
  onMessage,
  onAdded,
}: {
  genres: GenreItem[];
  /** A result or error, for the page's message banner. */
  onMessage: (message: ReactNode) => void;
  /** A channel was added: reload the table. */
  onAdded: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [addGenre, setAddGenre] = useState("");
  const [years, setYears] = useState("1");
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<ResolvedPreview | null>(null);
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
    // Plain names resolve via search, which can guess wrong — preview the
    // match and ask for confirmation instead of adding straight away.
    if (!isExactInput(input)) {
      setAdding(true);
      try {
        const data = await api(`/api/channels/resolve?input=${encodeURIComponent(input.trim())}`, {
          fallback: "Couldn't find that channel",
        });
        setPending(data.channel);
      } catch (err) {
        onMessage((err as Error).message);
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
      const data = await api("/api/channels", {
        method: "POST",
        body: {
          input: value,
          genreId: addGenre ? Number(addGenre) : null,
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
          {/* The one moment you'd want to jump: the feed, filtered to the new channel. */}
          <Link
            href={`/?channel=${data.channel.id}`}
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
        placeholder="Paste a channel URL or @handle, e.g. @mkbhd"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setPending(null);
        }}
        aria-label="Channel URL, @handle or name"
      />
      <select
        className="field h-10 cursor-pointer px-2.5 text-sm font-semibold"
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
        className="ml-1 label-caps"
        title="How far back to fetch uploads when the channel is added. After that, the sync keeps it fresh."
      >
        Backfill
      </span>
      <SegmentedControl
        label="How many years of uploads to fetch"
        value={years}
        onChange={setYears}
        options={["1", "2", "3", "4", "5"].map((y) => ({ value: y, label: `${y}Y` }))}
      />
      <Button type="submit" variant="primary" size="sm" disabled={!input.trim()} busy={adding} busyLabel="Adding…" className="h-10 px-4">
        <Icon name="plus" size={15} />
        Add
      </Button>
      {adding && !pending && (
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
            <Button size="sm" variant="primary" busy={adding} busyLabel="Adding…" onClick={() => doAdd(pending.ytChannelId)}>
              Yes, add it
            </Button>
            <Button size="sm" onClick={() => setPending(null)}>
              No
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
