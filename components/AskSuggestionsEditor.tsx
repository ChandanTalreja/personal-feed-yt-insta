"use client";

import { useEffect, useState } from "react";
import Button from "./ui/Button";
import Icon from "./ui/Icon";
import Spinner from "./ui/Spinner";

const MAX = 3;

/**
 * Up to three questions you ask of almost any video. They appear as
 * one-click buttons in the study panel's Ask tab, after the genre's own
 * suggestion. A suggestion costs nothing until clicked; then it's a normal
 * Ask (and the answer is cached like any other).
 */
export default function AskSuggestionsEditor() {
  const [items, setItems] = useState<string[] | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/ask-suggestions")
      .then((r) => r.json())
      .then((d) => {
        const list: string[] = d.suggestions ?? [];
        setSaved(list);
        setItems([...list, "", "", ""].slice(0, MAX));
      })
      .catch(() => setItems(["", "", ""]));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!items) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/ask-suggestions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestions: items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setSaved(data.suggestions);
      setItems([...data.suggestions, "", "", ""].slice(0, MAX));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const changed =
    items != null &&
    JSON.stringify(items.map((s) => s.trim()).filter(Boolean)) !== JSON.stringify(saved);

  return (
    <form
      id="ask-suggestions"
      onSubmit={save}
      className="scroll-mt-20 rounded-lg border border-line bg-surface p-4"
    >
      <h2 className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-muted">Everyday Ask suggestions</h2>
      <p className="mt-1.5 text-meta text-muted">
        Questions you ask of almost any video. They show as one-click buttons in
        the Ask tab, after the genre&apos;s own suggestion. Leave blank for none.
      </p>
      {items == null ? (
        <Spinner label="Loading…" size={13} className="mt-3 text-sm text-muted" />
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((value, i) => (
            <input
              key={i}
              className="nb-input h-9 w-full px-3 text-sm"
              placeholder={
                [
                  "e.g. Summarise as revision notes",
                  "e.g. Give me the code shown",
                  "e.g. What should I remember from this?",
                ][i]
              }
              maxLength={200}
              value={value}
              onChange={(e) => {
                setStatus("idle");
                setItems((list) => list && list.map((s, j) => (j === i ? e.target.value : s)));
              }}
              aria-label={`Everyday suggestion ${i + 1}`}
            />
          ))}
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={!changed} busy={status === "saving"} busyLabel="Saving…">
              Save suggestions
            </Button>
            {status === "saved" && !changed && (
              <span className="flex items-center gap-1 text-meta font-semibold text-muted"><Icon name="check" size={13} />Saved</span>
            )}
            {status === "error" && (
              <span className="text-meta font-semibold text-danger">Couldn&apos;t save — try again</span>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
