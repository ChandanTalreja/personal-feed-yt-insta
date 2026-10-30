"use client";

import { useSyncExternalStore } from "react";

// The Feed's greeting (FEAT-11): one handwritten line above the title, in
// two inks, the greeting in black and the message in red. The time of day
// is the browser's (Netlify runs on UTC, so the server can't pick it): the
// server and the first render draw an empty line of the same height, then
// React fills it in, without a hydration mismatch (that's what
// useSyncExternalStore's server snapshot is for).

type PartOfDay = "morning" | "afternoon" | "evening" | "night";
type Line = { greeting: (name?: string) => string; message: string };

/** "Good morning, Chandan." or, without a name, "Good morning." */
function hello(words: string, end = "."): (name?: string) => string {
  return (name) => (name ? `${words}, ${name}${end}` : `${words}${end}`);
}

// Four lines for each part of the day; one a day, in turn (see `pick`).
const LINES: Record<PartOfDay, Line[]> = {
  morning: [
    { greeting: hello("Good morning"), message: "Coffee first, then the queue." },
    { greeting: hello("Morning"), message: "Fresh uploads, fresh brain." },
    { greeting: hello("Rise and shine"), message: "The queue waited up for you." },
    { greeting: hello("Good morning"), message: "One good video before the day gets loud." },
  ],
  afternoon: [
    { greeting: hello("Good afternoon"), message: "A quick one between things?" },
    { greeting: hello("Afternoon"), message: "Lunch break? Pick a short one." },
    { greeting: hello("Hey"), message: "Ten minutes is enough for something good." },
    { greeting: hello("Good afternoon"), message: "Learn one thing, then back to it." },
  ],
  evening: [
    { greeting: hello("Good evening"), message: "Settle in, it’s all here." },
    { greeting: hello("Evening"), message: "Day’s done. Your turn now." },
    { greeting: hello("Welcome back"), message: "Feet up, queue on." },
    { greeting: hello("Good evening"), message: "Something long tonight?" },
  ],
  night: [
    { greeting: hello("Still up", "?"), message: "One more video, then sleep." },
    { greeting: hello("Late one", "?"), message: "Short ones only after midnight." },
    { greeting: hello("Night owl mode"), message: "Pick one, then pillow." },
    { greeting: hello("Burning the midnight oil", "?"), message: "Save the long ones for tomorrow." },
  ],
};

const HOUR = 60 * 60 * 1000;

/**
 * Which line, as "evening:2": the part of the day (5 am to 12 pm morning,
 * to 5 pm afternoon, to 10 pm evening, then night), and one line per day,
 * taking turns, so none repeats until you've seen all four. The day starts
 * at 5 am, so a late night keeps its line past midnight. A plain string, so
 * React only redraws when it changes.
 */
function pick(): string {
  const now = new Date();
  const hour = now.getHours();
  const part: PartOfDay =
    hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 22 ? "evening" : "night";
  const localMs = now.getTime() - now.getTimezoneOffset() * 60_000;
  const day = Math.floor((localMs - 5 * HOUR) / (24 * HOUR));
  return `${part}:${day % LINES[part].length}`;
}

// Look again every minute, so a page left open turns from evening to night.
function subscribe(changed: () => void) {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}

export default function Greeting({ name }: { name?: string }) {
  const picked = useSyncExternalStore(subscribe, pick, () => null);
  const [part, index] = picked ? (picked.split(":") as [PartOfDay, string]) : [];
  const line = part ? LINES[part][Number(index)] : null;
  return (
    <p className="pen-greeting mb-1.5 min-h-[1.75rem]">
      {line && (
        <>
          <span className="text-ink">{line.greeting(name)}</span>{" "}
          <span className="text-pen-red">{line.message}</span>
        </>
      )}
    </p>
  );
}
