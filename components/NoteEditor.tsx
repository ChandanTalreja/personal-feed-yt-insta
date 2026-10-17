"use client";

import { useEffect, useRef, useState } from "react";
import { notifyNavChanged } from "@/lib/nav-events";
import { api } from "@/lib/api-client";

interface Props {
  videoId: number;
  initial: string | null;
  /** Called after each successful save with the stored note (null = deleted). */
  onSaved?: (note: string | null, savedAt: string | null) => void;
  autoFocus?: boolean;
  rows?: number;
  /** Bigger text for roomy places (the study panel). */
  large?: boolean;
}

type Status = "idle" | "saving" | "saved" | "error";

const SAVE_AFTER_MS = 800;
const RETRY_AFTER_MS = 5000;
const MAX_CHARS = 20_000; // matches the API's limit

/**
 * Your own note on a video — one per video. No save button: it saves a
 * moment after you stop typing, on blur, and when it closes. Clearing the
 * text deletes the note. Shared by the video card and the Notebook page.
 */
export default function NoteEditor({
  videoId,
  initial,
  onSaved,
  autoFocus,
  rows = 4,
  large = false,
}: Props) {
  const [text, setText] = useState(initial ?? "");
  const [status, setStatus] = useState<Status>("idle");
  // Refs so the timers and the unmount flush always see the latest values.
  const textRef = useRef(text);
  const savedRef = useRef((initial ?? "").trim());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Opening an existing note to add to it: put the cursor at the end, not
  // the start (the browser's default for a focused textarea).
  useEffect(() => {
    const el = areaRef.current;
    if (!autoFocus || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(final = false) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const value = textRef.current;
    if (value.trim() === savedRef.current) return;
    if (!final) setStatus("saving");
    api(`/api/videos/${videoId}`, {
      method: "PATCH",
      body: { personalNote: value },
      keepalive: final, // let the last save finish as the panel closes
      fallback: "Save failed",
    })
      .then((data) => {
        savedRef.current = value.trim();
        onSavedRef.current?.(data.video.personalNote, data.video.personalNoteAt);
        notifyNavChanged();
        if (!final) setStatus("saved");
      })
      .catch(() => {
        if (final) return;
        setStatus("error");
        timerRef.current = setTimeout(() => save(), RETRY_AFTER_MS);
      });
  }

  // Flush anything unsaved when the editor closes.
  useEffect(() => {
    return () => {
      if (textRef.current.trim() !== savedRef.current) save(true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange(value: string) {
    setText(value);
    textRef.current = value;
    setStatus("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(), SAVE_AFTER_MS);
  }

  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? text.trim()
          ? "Saved ✓"
          : "Note deleted"
        : status === "error"
          ? "Couldn't save — retrying…"
          : "Saves automatically";

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className={`field w-full resize-y leading-relaxed ${
          large ? "p-3 text-lg" : "p-2.5 text-meta"
        }`}
        rows={rows}
        maxLength={MAX_CHARS}
        placeholder="Your note on this video — timestamps, what to revise, what to skip…"
        ref={areaRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => save()}
        aria-label="Your note on this video"
      />
      <p
        className={`text-xs font-medium ${
          status === "error" ? "text-danger" : "text-muted"
        }`}
      >
        {label}
      </p>
    </div>
  );
}
