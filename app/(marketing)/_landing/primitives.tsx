import type { CSSProperties, ReactNode } from "react";

/*
 * The landing page's structural pieces. All static — no client boundary.
 */

// The wide frame. Each section owns its top border, so the frame's side
// borders stack section-to-section into continuous full-page rails.
export function Frame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`frame-wide ${className}`}>{children}</div>;
}

// A section label, marked with the page's + glyph so the mark travels with the
// copy rather than the frame.
export function Mark({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow">
      <span className="mr-2 text-border">+</span>
      {children}
    </p>
  );
}

// A write streak on one of the frame's rails — down or up a side rail, left or
// right along a section's own top rule. Frame rails only: the navbar, the
// ticker band and the break bands are left alone. Each call site picks its own
// duration; they are non-harmonic so no two streaks fall into step. The
// negative delays start every streak mid-flight, so the rails are already
// alive on first paint.
export function RailStreak({
  edge,
  dir = "fwd",
  delay,
  duration,
}: {
  edge: "left" | "right" | "top";
  dir?: "fwd" | "rev";
  delay: string;
  duration: string;
}) {
  const anim =
    edge === "top"
      ? dir === "rev"
        ? "rail-streak-left"
        : "rail-streak-right"
      : dir === "rev"
        ? "rail-streak-up"
        : "rail-streak-down";

  return (
    <span
      className={
        edge === "top"
          ? "rail-streak rail-streak-h"
          : `rail-streak rail-streak-v is-${edge}`
      }
      style={
        {
          "--streak-anim": anim,
          "--streak-delay": delay,
          "--streak-duration": duration,
        } as CSSProperties
      }
      aria-hidden
    />
  );
}
