import type { CSSProperties, ReactNode } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { WrittenSheet } from "@/lib/handwritten/document";
import {
  HANDS,
  INKS,
  MARKS,
  PAPERS,
  PRESETS,
  matchingPreset,
  type HandwrittenStyle,
  type MarkId,
  type Paper,
} from "@/lib/handwritten/themes";

/**
 * The choices beside the paper: a starting point, which sheets, and the
 * paper, ink, hand and marks. Tiles, not dropdowns: you see each choice.
 */
export default function Tray({
  sheets,
  picked,
  onPick,
  style,
  onStyle,
}: {
  sheets: WrittenSheet[];
  picked: number[];
  onPick: (ids: number[]) => void;
  style: HandwrittenStyle;
  onStyle: (change: Partial<HandwrittenStyle>) => void;
}) {
  const preset = matchingPreset(style);
  const inkColor = INKS.find((i) => i.id === style.ink)?.color;

  return (
    <div className="grid gap-6">
      <Group label="Start from">
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <Tile
              key={p.id}
              on={preset?.id === p.id}
              onClick={() => onStyle(p)}
              label={p.name}
              note={p.tag}
            >
              <Thumb paper={PAPERS.find((x) => x.id === p.paper)!} tall />
            </Tile>
          ))}
        </div>
      </Group>

      <Group label="Sheets">
        <SheetChips sheets={sheets} picked={picked} onPick={onPick} />
      </Group>

      <Group label="Paper">
        <div className="grid grid-cols-2 gap-2">
          {PAPERS.map((p) => (
            <Tile key={p.id} on={style.paper === p.id} onClick={() => onStyle({ paper: p.id })} label={p.name}>
              <Thumb paper={p} />
            </Tile>
          ))}
        </div>
      </Group>

      <Group label="Ink">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ink">
          {INKS.map((i) => {
            const on = style.ink === i.id;
            return (
              <button
                key={i.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onStyle({ ink: i.id })}
                className={`flex items-center gap-2 rounded-full border bg-surface py-1 pl-1.5 pr-3 text-meta transition-colors ${
                  on ? "border-ink font-bold ring-1 ring-inset ring-ink" : "border-line hover:border-ink"
                }`}
              >
                <span className="h-5 w-5 rounded-full ring-1 ring-inset ring-ink/15" style={{ background: i.color }} />
                {i.name}
              </button>
            );
          })}
        </div>
      </Group>

      <Group label="Hand">
        <div className="grid grid-cols-2 gap-2">
          {HANDS.map((h) => (
            <Tile key={h.id} on={style.hand === h.id} onClick={() => onStyle({ hand: h.id })} label={h.name}>
              <span
                className="block h-[30px] overflow-hidden whitespace-nowrap leading-[30px]"
                style={{ fontFamily: `${h.family}, cursive`, fontSize: Math.round(h.size * 0.95), color: inkColor }}
              >
                Exception
              </span>
            </Tile>
          ))}
        </div>
      </Group>

      <Group label="Marks">
        <SegmentedControl<MarkId>
          label="Marks"
          value={style.marks}
          onChange={(marks) => onStyle({ marks })}
          options={MARKS.map((m) => ({ value: m.id, label: m.name }))}
        />
      </Group>
    </div>
  );
}

/**
 * Which sheets to write: "All sheets" takes every one; a sheet chip adds or
 * removes that sheet (after "All", it starts a fresh pick with just that
 * one). There's always at least one.
 */
function SheetChips({
  sheets,
  picked,
  onPick,
}: {
  sheets: WrittenSheet[];
  picked: number[];
  onPick: (ids: number[]) => void;
}) {
  const all = sheets.map((s) => s.id);
  const everything = sheets.length > 1 && picked.length === all.length;
  const total = sheets.reduce((n, s) => n + s.questions.length, 0);
  const toggle = (id: number) => {
    const from = everything ? [] : picked;
    const next = from.includes(id) ? from.filter((x) => x !== id) : [...from, id];
    onPick(next.length ? all.filter((x) => next.includes(x)) : [id]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {sheets.length > 1 && (
        <Chip on={everything} onClick={() => onPick(all)} count={total} strong>
          All sheets
        </Chip>
      )}
      {sheets.map((s) => (
        <Chip key={s.id} on={!everything && picked.includes(s.id)} onClick={() => toggle(s.id)} count={s.questions.length}>
          {s.topic}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  on,
  onClick,
  count,
  strong = false,
  children,
}: {
  on: boolean;
  onClick: () => void;
  count: number;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm border bg-surface py-1 pl-2.5 pr-1.5 text-meta transition-colors ${
        on ? "border-ink font-bold ring-1 ring-inset ring-ink" : `border-line hover:border-ink ${strong ? "font-bold" : ""}`
      }`}
    >
      {children}
      <span className={`rounded-xs px-1.5 font-mono text-xs ${on ? "bg-primary text-ink" : "bg-cream text-muted"}`}>
        {count}
      </span>
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5" aria-label={label}>
      <h2 className="label-caps text-muted">{label}</h2>
      {children}
    </section>
  );
}

/** A choice you can see: a small picture of it and its name. Lifts on hover. */
function Tile({
  on,
  onClick,
  label,
  note,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  /** A few words under the name. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`lift grid content-start gap-1.5 rounded-md border bg-surface p-2 text-left ${
        on ? "border-ink ring-1 ring-inset ring-ink" : "border-line"
      }`}
    >
      {children}
      <span className="flex items-center justify-between gap-1.5 text-meta font-semibold">
        {label}
        {on && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-primary ring-1 ring-ink" aria-hidden />}
      </span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </button>
  );
}

/** The paper itself, small (handwritten.css draws it from the same values). */
function Thumb({ paper, tall = false }: { paper: Paper; tall?: boolean }) {
  const vars = {
    "--hw-bg": paper.background,
    "--hw-rule": paper.rule,
    "--hw-margin": paper.margin ?? "transparent",
  } as CSSProperties;
  return <span className={`hw-thumb block ${tall ? "hw-thumb-tall" : ""}`} data-pattern={paper.pattern} style={vars} />;
}
