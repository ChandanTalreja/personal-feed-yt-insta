"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { formatDuration, timeAgo } from "@/lib/format";
import CopyButton from "./CopyButton";
import type { FeedVideo } from "./types";

interface Note {
  id: number;
  prompt: string;
  answer: string;
  source: string | null;
  createdAt: string;
}

interface Props {
  video: FeedVideo;
  accentColor: string;
  /** Optional per-genre suggested question, shown as a single preset chip. */
  askPreset: string | null;
  onPlay: (video: FeedVideo) => void;
  onToggleWatched: (video: FeedVideo) => void;
}

type Panel = "summary" | "ask" | "transcript" | null;

export default function VideoCard({
  video,
  accentColor,
  askPreset,
  onPlay,
  onToggleWatched,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null);

  const [summary, setSummary] = useState<string | null>(video.summary);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  function togglePanel(next: Panel) {
    setPanel((p) => (p === next ? null : next));
  }

  async function handleSummarize() {
    togglePanel("summary");
    if (summary || summaryBusy) return;
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/videos/${video.id}/summarize`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Summarize failed");
      setSummary(data.summary);
    } catch (err) {
      setSummaryError((err as Error).message);
    } finally {
      setSummaryBusy(false);
    }
  }

  async function handleTranscript() {
    togglePanel("transcript");
    if (transcript || transcriptBusy) return;
    setTranscriptBusy(true);
    setTranscriptError(null);
    try {
      const res = await fetch(`/api/videos/${video.id}/transcript`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Transcript failed");
      setTranscript(data.transcript);
    } catch (err) {
      setTranscriptError((err as Error).message);
    } finally {
      setTranscriptBusy(false);
    }
  }

  async function openAsk() {
    togglePanel("ask");
    if (notesLoaded) return;
    try {
      const res = await fetch(`/api/videos/${video.id}/ask`);
      const data = await res.json();
      if (res.ok) setNotes(data.notes ?? []);
    } finally {
      setNotesLoaded(true);
    }
  }

  async function handleAsk(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || askBusy) return;
    setAskBusy(true);
    setAskError(null);
    try {
      const res = await fetch(`/api/videos/${video.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ask failed");
      setNotes((prev) => [
        data.note,
        ...prev.filter((n) => n.id !== data.note.id),
      ]);
      setQuestion("");
    } catch (err) {
      setAskError((err as Error).message);
    } finally {
      setAskBusy(false);
    }
  }

  return (
    <article
      className={`nb video-card flex flex-col overflow-hidden rounded-xl ${
        video.watched ? "opacity-60" : ""
      }`}
    >
      <button
        className="relative block w-full cursor-pointer border-b-3 border-[var(--ink)] bg-black text-left"
        onClick={() => onPlay(video)}
        aria-label={`Play ${video.title}`}
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className={`aspect-video w-full object-cover ${
              video.watched ? "grayscale" : ""
            }`}
          />
        ) : (
          <div className="aspect-video w-full bg-neutral-800" />
        )}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100">
          <span className="nb-sm rounded-full px-4 py-2 text-lg font-bold">
            ▶ PLAY
          </span>
        </span>
        {video.durationSeconds > 0 && (
          <span className="absolute bottom-2 right-2 rounded border-2 border-[var(--ink)] bg-white px-1.5 py-0.5 text-xs font-bold">
            {formatDuration(video.durationSeconds)}
          </span>
        )}
        {video.isShort && (
          <span className="absolute left-2 top-2 rounded border-2 border-[var(--ink)] bg-[var(--pink)] px-1.5 py-0.5 text-xs font-bold">
            SHORT
          </span>
        )}
        {video.isLive && (
          <span className="absolute left-2 top-2 rounded border-2 border-[var(--ink)] bg-[var(--accent)] px-1.5 py-0.5 text-xs font-bold text-white">
            STREAM
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">
          {video.title}
        </h3>
        <div className="flex items-center gap-2 text-xs">
          {video.channelThumbnail && (
            <img
              src={video.channelThumbnail}
              alt=""
              referrerPolicy="no-referrer"
              className="h-5 w-5 rounded-full border border-[var(--ink)]"
            />
          )}
          <span
            className="rounded border border-[var(--ink)] px-1.5 py-0.5 font-semibold"
            style={{ backgroundColor: accentColor }}
          >
            {video.channelTitle}
          </span>
          <span className="ml-auto text-neutral-500">
            {timeAgo(video.publishedAt)}
          </span>
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <button
            className="nb-chip rounded px-2 py-1 text-xs"
            data-active={video.watched}
            onClick={() => onToggleWatched(video)}
            title={video.watched ? "Mark as unwatched" : "Mark as watched"}
          >
            {video.watched ? "✓ SEEN" : "MARK SEEN"}
          </button>
          <button
            className="nb-chip rounded px-2 py-1 text-xs"
            data-active={panel === "summary"}
            onClick={handleSummarize}
            disabled={summaryBusy}
            title="Summarize with Gemini"
          >
            {summaryBusy ? "…" : "✨ SUMMARY"}
          </button>
          <button
            className="nb-chip rounded px-2 py-1 text-xs"
            data-active={panel === "ask"}
            onClick={openAsk}
            title="Ask Gemini about this video"
          >
            💬 ASK
          </button>
          <button
            className="nb-chip rounded px-2 py-1 text-xs"
            data-active={panel === "transcript"}
            onClick={handleTranscript}
            disabled={transcriptBusy}
            title="Full transcript"
          >
            {transcriptBusy ? "…" : "📄 TEXT"}
          </button>
        </div>

        {panel === "summary" && (summary || summaryError || summaryBusy) && (
          <div className="nb-sm mt-1 rounded p-2 text-xs leading-relaxed">
            {summaryBusy ? (
              "Reading the video…"
            ) : summaryError ? (
              <span className="text-[var(--accent)]">{summaryError}</span>
            ) : (
              <>
                <div className="mb-1 flex justify-end">
                  <CopyButton text={summary ?? ""} />
                </div>
                <div className="whitespace-pre-wrap">{summary}</div>
              </>
            )}
          </div>
        )}

        {panel === "transcript" && (
          <div className="nb-sm mt-1 max-h-56 overflow-y-auto rounded p-2 text-xs leading-relaxed">
            {transcriptBusy ? (
              "Fetching transcript… (videos without captions take a minute — Gemini listens to the whole thing)"
            ) : transcriptError ? (
              <span className="text-[var(--accent)]">{transcriptError}</span>
            ) : (
              <>
                <div className="sticky top-0 mb-1 flex justify-end">
                  <CopyButton text={transcript ?? ""} />
                </div>
                <div className="whitespace-pre-wrap">{transcript}</div>
              </>
            )}
          </div>
        )}

        {panel === "ask" && (
          <div className="mt-1 flex flex-col gap-2">
            {askPreset && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  className="nb-chip rounded px-2 py-1 text-[10px]"
                  disabled={askBusy}
                  onClick={() => handleAsk(askPreset)}
                  title={askPreset}
                >
                  {askPreset.length > 40
                    ? askPreset.slice(0, 38) + "…"
                    : askPreset}
                </button>
              </div>
            )}
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                handleAsk(question);
              }}
            >
              <input
                className="nb-input min-w-0 flex-1 rounded px-2 py-1 text-xs"
                placeholder="Ask anything about this video…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <button
                type="submit"
                className="nb-btn rounded px-2.5 py-1 text-xs"
                disabled={askBusy || !question.trim()}
              >
                {askBusy ? "…" : "ASK"}
              </button>
            </form>
            {askBusy && (
              <p className="text-[10px] font-semibold text-neutral-500">
                Working on it — long videos without captions can take a minute…
              </p>
            )}
            {askError && (
              <p className="text-xs font-semibold text-[var(--accent)]">
                {askError}
              </p>
            )}
            {notes.length > 0 && (
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="nb-sm whitespace-pre-wrap rounded p-2 text-xs leading-relaxed"
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="font-bold">Q: {note.prompt}</p>
                      <CopyButton text={note.answer} />
                    </div>
                    {note.answer}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
