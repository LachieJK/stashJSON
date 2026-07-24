"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

/*
 * A full-bleed band tiled with the page's + glyph, separating sections the way
 * a rule does but with texture. Two stacked grids: the resting one of + marks
 * in border grey, and above it the same cells holding JSON punctuation at full
 * contrast, revealed only inside a soft disc that follows the pointer. The
 * band is dead still until a cursor crosses it.
 *
 * Glyphs are picked by an index hash rather than Math.random so the server and
 * the client render the same band.
 */

const GLYPHS = ["{", "}", "[", "]", ":", ",", '"', "0", "1", "+"];
const CELLS = 300;
const glyphAt = (i: number) => GLYPHS[(i * 7919) % GLYPHS.length];

export function SectionBreak() {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const track = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || frame.current) return;
    const { clientX, clientY } = e;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${clientX - r.left}px`);
      el.style.setProperty("--my", `${clientY - r.top}px`);
      el.style.setProperty("--lit", "1");
    });
  };

  return (
    <div
      ref={ref}
      onPointerMove={track}
      onPointerLeave={() => ref.current?.style.setProperty("--lit", "0")}
      className="section-break border-y border-border"
      aria-hidden
    >
      <div className="section-break-grid">
        {Array.from({ length: CELLS }, (_, i) => (
          <span key={i}>+</span>
        ))}
      </div>
      <div className="section-break-grid section-break-lit">
        {Array.from({ length: CELLS }, (_, i) => (
          <span key={i}>{glyphAt(i)}</span>
        ))}
      </div>
    </div>
  );
}
