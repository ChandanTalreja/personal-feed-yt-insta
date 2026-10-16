/**
 * An emoji with a thin ink outline. Light glyphs (✨, 💬, 📄) otherwise fade
 * into the white buttons and the cream page. Inline style, not a globals.css
 * class, so it can't hit the stale-CSS dev-server gotcha.
 */
export default function Emoji({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        filter:
          "drop-shadow(0 0 0.6px #161616) drop-shadow(0 0 0.6px #161616)",
      }}
    >
      {children}
    </span>
  );
}
