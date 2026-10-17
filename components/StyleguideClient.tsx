"use client";

import { useState } from "react";
import TopBar from "./TopBar";
import Button from "./ui/Button";
import Icon, { type IconName } from "./ui/Icon";
import IconButton from "./ui/IconButton";
import PageTitle from "./ui/PageTitle";
import SegmentedControl from "./ui/SegmentedControl";
import SidePanel from "./ui/SidePanel";
import { SidebarItem, SidebarSection, SidebarTile } from "./ui/SidebarList";
import Spinner, { SpinnerBadge } from "./ui/Spinner";
import { ICONS } from "./ui/iconPaths";

// Mirrors the @theme tokens in app/globals.css (docs/REDESIGN.md §2 v2).
const SWATCHES: [string, string, string][] = [
  ["cream", "#fbf6ec", "Page, top bar, sidebar"],
  ["surface", "#fffdf8", "Cards, inputs, selected row"],
  ["ink", "#1a1712", "Text, hover outline, shadows"],
  ["muted", "#6f675b", "All secondary text"],
  ["line", "ink at 13%", "Every quiet border"],
  ["primary", "#ffd02b", "Selected, “on”, main button, marker"],
  ["danger", "#e5484d", "Errors, destructive"],
  ["pen", "#2c55c7", "Handwriting only"],
];

const SIZES: [string, string, string][] = [
  ["text-xs", "12px", "Small caps labels, badges, counts"],
  ["text-meta", "13px", "Metadata, secondary controls"],
  ["text-sm", "14px", "Body, buttons, rows"],
  ["text-lg", "15px", "Card titles, the line under a title"],
  ["text-xl", "22px", "Section headings"],
  ["text-display", "40px", "Page titles"],
];

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="nb p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
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
  const [busy, setBusy] = useState(false);

  return (
    <>
      <TopBar />
      <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-8">
        <PageTitle
          title="Style guide"
          note="calm base, retro accents"
          summary="Design system v2 (Phase 9): the tokens and building blocks every screen uses."
        />

        <div className="flex flex-col gap-6">
          <Block title="Colours" note="Defined once in globals.css; use them as bg-*, text-*, border-*. Genre colours stay user-defined.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SWATCHES.map(([name, hex, use]) => (
                <div key={name} className="overflow-hidden rounded-md border border-line bg-surface">
                  <div className="h-14 border-b border-line" style={{ backgroundColor: `var(--color-${name})` }} />
                  <div className="p-2.5">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="font-mono text-xs text-muted">{hex}</p>
                    <p className="text-xs text-muted">{use}</p>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          <Block title="Type" note="Six sizes and nothing in between. Archivo Black for titles, Space Grotesk for reading, Space Mono for numbers and small labels.">
            <div className="flex flex-col gap-3">
              {SIZES.map(([cls, px, use]) => (
                <div key={cls} className="flex items-baseline gap-4 border-b border-line pb-3 last:border-0">
                  <span className="w-36 shrink-0 font-mono text-xs text-muted">
                    {cls} · {px}
                  </span>
                  <span className={`${cls} ${cls === "text-display" ? "font-display" : ""}`}>{use}</span>
                </div>
              ))}
              <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-muted">Section label</p>
              <p className="font-mono text-meta">699 to watch · 1:08:29 · Synced 3h ago</p>
            </div>
          </Block>

          <Block title="Shape and shadow" note="Corners 4 / 6 / 8 / 10px. Flat at rest; the hard shadow is earned.">
            <div className="flex flex-wrap items-start gap-6">
              <div className="lift w-44 cursor-pointer rounded-lg border border-line bg-surface p-4 text-sm">
                <p className="font-semibold">A card</p>
                <p className="text-meta text-muted">Hover me: I lift.</p>
              </div>
              <div className="flex flex-col items-start gap-2">
                <Button variant="primary">
                  <Icon name="plus" size={15} />
                  Sticker button
                </Button>
                <p className="text-meta text-muted">The one shadow at rest on a screen.</p>
              </div>
            </div>
          </Block>

          <Block title="The marker and the pen" note="Two hand-drawn tools, one job each.">
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                <span className="font-semibold">Marker (yellow) = you are here:</span> the stroke under the active tab in the top bar.
              </p>
              <p className="flex flex-wrap items-baseline gap-3 text-sm">
                <span className="font-semibold">Pen (blue) = margin notes:</span>
                <span className="pen-note">newest first, no algorithm</span>
                <span className="text-meta text-muted">— at most one per screen, beside the page title.</span>
              </p>
            </div>
          </Block>

          <Block title="Icons" note="Phosphor duotone. Quiet at rest; on hover (or when “on”) the inside turns yellow. Open shapes never fill.">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
              {(Object.keys(ICONS) as IconName[]).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="icon-hover flex flex-col items-center gap-1.5 rounded-md border border-line py-3 text-muted hover:border-ink hover:text-ink"
                >
                  <Icon name={name} size={22} />
                  <span className="font-mono text-xs">{name}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-meta text-muted">
              <span className="flex items-center gap-1.5"><Icon name="ask" size={18} /> at rest</span>
              <span className="flex items-center gap-1.5 text-ink"><Icon name="ask" size={18} lit /> lit (“on”)</span>
              <span className="flex items-center gap-1.5 text-ink"><Icon name="play" size={18} filled /> filled</span>
            </div>
          </Block>

          <Block title="Waiting" note="One spinner, always with a word. Only one thing moves.">
            <div className="flex flex-wrap items-center gap-4">
              <SpinnerBadge label="Syncing" />
              <Spinner label="Thinking…" className="text-sm font-semibold" />
              <Button size="sm" busy={busy} onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 2000); }}>
                Click me
              </Button>
            </div>
          </Block>

          <Block title="Buttons" note="Primary is yellow with an ink edge; secondary is a quiet frame; ghost has none until hovered.">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">
                <Icon name="plus" size={15} />
                Add channel
              </Button>
              <Button variant="secondary">
                <Icon name="track" size={16} />
                Add to track
              </Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
              <Button variant="primary" size="sm">
                <Icon name="play" size={12} filled />
                Continue
              </Button>
            </div>
          </Block>

          <Block title="Icon buttons" note="Instant hover labels. Filled black = the open tool. A number badge = saved answers.">
            <div className="flex flex-wrap items-center gap-2 pt-6">
              {(
                [
                  ["Ask", "ask", 2],
                  ["Summary", "summary", undefined],
                  ["Transcript", "text", undefined],
                  ["Note", "note", undefined],
                  ["Add to track", "track", undefined],
                ] as [string, IconName, number | undefined][]
              ).map(([label, icon, badge], i) => (
                <IconButton
                  key={label}
                  label={label}
                  active={tool === label}
                  badge={badge}
                  align={i === 0 ? "left" : i === 4 ? "right" : "center"}
                  onClick={() => setTool(tool === label ? null : label)}
                >
                  <Icon name={icon} size={17} />
                </IconButton>
              ))}
              <span className="ml-2 text-sm text-muted">
                Active: <b className="text-ink">{tool ?? "none"}</b> (click to toggle)
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
                  { value: "short", label: "<10m" },
                  { value: "medium", label: "10–30m" },
                  { value: "long", label: "30m+" },
                ]}
              />
            </div>
          </Block>

          <Block title="Sidebar list and side panel" note="The feed's left sidebar and the right-hand study panel.">
            <div className="flex h-96 overflow-hidden rounded-lg border border-line">
              <div className="w-60 shrink-0 overflow-y-auto border-r border-line bg-cream py-4">
                <SidebarSection title="Your feed">
                  {(
                    [
                      ["Inbox", 124, "inbox", "bg-tile-yellow"],
                      ["Watch later", 18, "later", "bg-tile-pink"],
                      ["Watched", "2.1k", "watched", "bg-tile-green"],
                      ["Everything", "10.5k", "everything", "bg-tile-blue"],
                    ] as [string, number | string, IconName, string][]
                  ).map(([label, n, icon, tile]) => (
                    <SidebarItem
                      key={label}
                      label={label}
                      count={n}
                      active={view === label}
                      onClick={() => setView(label)}
                      leading={
                        <SidebarTile className={tile}>
                          <Icon name={icon} size={15} duotone={false} />
                        </SidebarTile>
                      }
                    />
                  ))}
                </SidebarSection>
                <SidebarSection title="Genres">
                  {[
                    ["Interview", "#ffc900", 157],
                    ["System Design", "#b49cff", 96],
                  ].map(([label, c, n]) => (
                    <SidebarItem
                      key={label as string}
                      label={label as string}
                      count={n as number}
                      leading={<span className="h-[9px] w-[9px] rounded-[3px]" style={{ backgroundColor: c as string }} />}
                    />
                  ))}
                </SidebarSection>
              </div>
              <div className="flex-1 bg-cream p-4">
                {panelOpen ? (
                  <div className="ml-auto h-full max-w-sm overflow-hidden rounded-lg border border-line">
                    <SidePanel
                      header={
                        <>
                          <p className="text-lg font-semibold">System Design Explained: From 1 Server to Millions</p>
                          <p className="text-meta text-muted">StarCode Kh · <span className="font-mono">12:40</span></p>
                        </>
                      }
                      onClose={() => setPanelOpen(false)}
                      actions={
                        <>
                          <Button variant="primary" size="sm">
                            <Icon name="play" size={12} filled />
                            Watch
                          </Button>
                          <Button variant="secondary" size="sm">
                            <Icon name="track" size={15} />
                            Add to track
                          </Button>
                        </>
                      }
                    >
                      <p className="text-sm text-muted">Panel body scrolls here; header and actions stay put.</p>
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
