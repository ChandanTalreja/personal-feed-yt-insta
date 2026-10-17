import { useState } from "react";
import { api } from "@/lib/api-client";
import { notifyNavChanged } from "@/lib/nav-events";
import type { Answer } from "./types";

/**
 * Asking Gemini about a video — the study panel's and the Notebook's Ask box.
 * The box empties as soon as you send (the question shows as "Thinking…");
 * if the request fails, your text comes back so you can fix or retry it.
 * `onAnswer` gets the saved answer; each screen shows it its own way.
 */
export function useAsk(videoId: number, onAnswer: (answer: Answer) => void) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(prompt: string) {
    const text = prompt.trim();
    if (!text || pending) return;
    setPending(text);
    setError(null);
    setQuestion(""); // sent: it shows as the pending question now
    try {
      const data = await api(`/api/videos/${videoId}/ask`, {
        method: "POST",
        body: { prompt: text },
        fallback: "Couldn't answer that",
      });
      onAnswer(data.note);
      notifyNavChanged();
    } catch (err) {
      setError((err as Error).message);
      setQuestion((q) => q || text); // give it back, unless something new was typed
    } finally {
      setPending(null);
    }
  }

  return { question, setQuestion, pending, error, ask };
}
