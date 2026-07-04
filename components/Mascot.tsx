"use client";

import { useEffect, useRef } from "react";

/**
 * A retro TV mascot whose eyes follow the cursor.
 */
export default function Mascot({ size = 72 }: { size?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const leftPupil = useRef<SVGCircleElement>(null);
  const rightPupil = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const MAX = 4.5;
    function onMove(e: MouseEvent) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      for (const [pupil, cx] of [
        [leftPupil.current, 38],
        [rightPupil.current, 62],
      ] as const) {
        if (!pupil) continue;
        const scale = rect.width / 100;
        const originX = rect.left + cx * scale;
        const originY = rect.top + 46 * scale;
        const dx = e.clientX - originX;
        const dy = e.clientY - originY;
        const dist = Math.hypot(dx, dy) || 1;
        const r = Math.min(MAX, dist / 20);
        pupil.setAttribute(
          "transform",
          `translate(${(dx / dist) * r}, ${(dy / dist) * r})`
        );
      }
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {/* antennas */}
      <line x1="38" y1="22" x2="24" y2="6" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
      <line x1="62" y1="22" x2="76" y2="6" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="24" cy="6" r="4" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="76" cy="6" r="4" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2.5" />
      {/* TV body */}
      <rect x="8" y="22" width="84" height="66" rx="10" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="4" />
      {/* screen */}
      <rect x="18" y="32" width="64" height="44" rx="6" fill="#fff" stroke="var(--ink)" strokeWidth="3.5" />
      {/* eyes */}
      <circle cx="38" cy="46" r="11" fill="#fff" stroke="var(--ink)" strokeWidth="3" />
      <circle cx="62" cy="46" r="11" fill="#fff" stroke="var(--ink)" strokeWidth="3" />
      <circle ref={leftPupil} cx="38" cy="46" r="4.5" fill="var(--ink)" />
      <circle ref={rightPupil} cx="62" cy="46" r="4.5" fill="var(--ink)" />
      {/* smile */}
      <path d="M 42 66 Q 50 72 58 66" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      {/* feet */}
      <rect x="24" y="88" width="12" height="7" rx="2" fill="var(--ink)" />
      <rect x="64" y="88" width="12" height="7" rx="2" fill="var(--ink)" />
    </svg>
  );
}
