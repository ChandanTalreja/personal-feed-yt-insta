"use client";

import { useState } from "react";
import TopBar from "./TopBar";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import SegmentedControl from "./ui/SegmentedControl";
import SidePanel from "./ui/SidePanel";
import { SidebarItem, SidebarSection } from "./ui/SidebarList";
import Emoji from "./Emoji";

// Mirrors the @theme tokens in app/globals.css (docs/REDESIGN.md §2).
const SWATCHES: [string, string, string][] = [
  ["cream", "#fbf1dd", "Page background"],
  ["ink", "#15130f", "Text, borders, shadows"],
  ["primary", "#ffd02b", "The one primary action"],
  ["surface", "#fffaf0", "Cards, panels, inputs"],
  ["tint", "#fff3c4", "Selected row, match"],
  ["line", "#f4e7ca", "Subtle fills, dividers"],
  ["line-2", "#e6d5b2", "Quiet borders"],
  ["faint", "#cdbb96", "Disabled, placeholders"],
  ["muted", "#8a7f70", "Secondary text"],
  ["muted-2", "#62594d", "Metadata"],
  ["pink", "#ff9be3", "Small accents"],
  ["warn", "#9a5800", "Warnings"],
  ["danger", "#ff4911", "Errors, destructive"],
];

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="nb p-5">
      <h2 className="font-display text-lg">{title}</h2>
      {note && <p className="mt-1 text-sm text-muted-2">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function StyleguideClient() {
  const [kind, setKind] = useState<"videos" | "shorts">("videos");
  const [len, setLen] = useState<"any" | "short" | "medium" | "long">("any");
  const [view, setView] = useState("Inbox");
  const [tool, setTool] = useState<string | null>("Ask");
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <>
    <TopBar />
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <header className="flex flex-wrap items-center gap-4 py-6">
        <div>
          <h1 className="font-display text-3xl">Style guide</h1>
          <p className="text-sm text-muted-2">
            Redesign phase 1 — the design tokens and the building blocks every screen will use.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <Block title="Colours" note="Defined once in globals.css; use them as bg-*, text-*, border-*.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {SWATCHES.map(([name, hex, use]) => (
              <div key={name} className="border-2 border-ink bg-surface">
                <div className="h-14 border-b-2 border-ink" style={{ backgroundColor: hex }} />
                <div className="p-2">
                  <p className="text-sm font-bold">{name}</p>
                  <p className="font-mono text-[11px] text-muted-2">{hex}</p>
                  <p className="text-[11px] text-muted">{use}</p>
                </div>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Type" note="Display for titles and labels, Space Grotesk for reading, Space Mono for numbers.">
          <p className="font-display text-3xl">TUBEBOX — Inbox</p>
          <p className="mt-2 text-base">
            Body text in Space Grotesk. Buttons and messages use sentence case.
          </p>
          <p className="mt-2 font-mono text-sm">124 unseen · 38h 12m · 1:08:29 · Synced 4 min ago</p>
          <p className="mt-1 font-display text-[11px] tracking-widest text-muted-2">SECTION LABEL</p>
        </Block>

        <Block title="Buttons" note="One primary (yellow, heavier shadow) per screen; everything else secondary or ghost.">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">+ Add channel</Button>
            <Button variant="secondary">Add to track</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
            <Button variant="primary" size="sm">
              ▶ Continue
            </Button>
            <Button variant="secondary" size="sm">
              Copy
            </Button>
          </div>
        </Block>

        <Block
          title="Icon buttons"
          note="Instant hover labels. Filled = active tool. Number badge = saved answers; dot = a note exists."
        >
          <div className="flex flex-wrap items-center gap-2 pt-6">
            {[
              ["Ask", "💬", 2 as number | "dot" | undefined],
              ["Summary", "✨", undefined],
              ["Transcript", "📄", undefined],
              ["Note", "📝", "dot" as const],
              ["Add to track", "🎯", undefined],
            ].map(([label, icon, badge], i) => (
              <IconButton
                key={label as string}
                label={label as string}
                active={tool === label}
                badge={badge as number | "dot" | undefined}
                align={i === 0 ? "left" : i === 4 ? "right" : "center"}
                onClick={() => setTool(tool === label ? null : (label as string))}
              >
                <Emoji>{icon as string}</Emoji>
              </IconButton>
            ))}
            <span className="ml-2 text-sm text-muted-2">
              Active: <b>{tool ?? "none"}</b> (click to toggle)
            </span>
          </div>
        </Block>

        <Block title="Segmented controls" note="Mutually exclusive choices in one frame.">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="Video type"
              value={kind}
              onChange={setKind}
              options={[
                { value: "videos", label: "Videos" },
                { value: "shorts", label: "Shorts" },
              ]}
            />
            <SegmentedControl
              label="Video length"
              size="sm"
              value={len}
              onChange={setLen}
              options={[
                { value: "any", label: "Any length" },
                { value: "short", label: "< 10m" },
                { value: "medium", label: "10–30m" },
                { value: "long", label: "30m +" },
              ]}
            />
          </div>
        </Block>

        <Block title="Sidebar list and side panel" note="The feed's left sidebar and the right-hand study panel.">
          <div className="flex h-96 border-2 border-ink">
            <div className="w-56 shrink-0 overflow-y-auto border-r-2 border-ink bg-surface">
              <SidebarSection title="VIEWS">
                {[
                  ["Inbox", 124],
                  ["Later", 18],
                  ["History", "2.1k"],
                  ["Everything", "10.5k"],
                ].map(([label, n]) => (
                  <SidebarItem
                    key={label as string}
                    label={label as string}
                    count={n}
                    active={view === label}
                    onClick={() => setView(label as string)}
                  />
                ))}
              </SidebarSection>
              <SidebarSection title="GENRES">
                {[
                  ["Interview", "#39d98a", 157],
                  ["System Design", "#b49cff", 96],
                ].map(([label, c, n]) => (
                  <SidebarItem
                    key={label as string}
                    label={label as string}
                    count={n as number}
                    leading={<span className="h-3 w-3 border-2 border-ink" style={{ backgroundColor: c as string }} />}
                  />
                ))}
              </SidebarSection>
            </div>
            <div className="flex-1 bg-cream p-4">
              {panelOpen ? (
                <div className="ml-auto h-full max-w-sm">
                  <SidePanel
                    header={
                      <>
                        <p className="font-bold leading-snug">System Design Explained: From 1 Server to Millions</p>
                        <p className="font-mono text-xs text-muted-2">StarCode Kh · 12:40</p>
                      </>
                    }
                    onClose={() => setPanelOpen(false)}
                    actions={
                      <>
                        <Button variant="primary" size="sm">
                          ▶ Watch
                        </Button>
                        <Button variant="secondary" size="sm">
                          Add to track
                        </Button>
                      </>
                    }
                  >
                    <p className="text-sm text-muted-2">Panel body scrolls here; header and actions stay put.</p>
                  </SidePanel>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setPanelOpen(true)}>
                  Open panel
                </Button>
              )}
            </div>
          </div>
        </Block>
      </div>
    </div>
    </>
  );
}
