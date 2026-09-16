import type { ReactNode } from "react";

// One section of the Usage report column: a full-bleed top rule with + ticks
// where it meets the frame's rails, a title, and an optional mono kicker. Each
// later slice (Traffic, When, What, Who, Log) is one of these.
export function UsageSection({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section-rule relative px-6 py-6">
      <span className="tick tick-tl" aria-hidden />
      <span className="tick tick-tr" aria-hidden />
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {kicker ? (
          <span className="font-mono text-[11px] text-muted">{kicker}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
