// A quota meter: `used / cap` over a hairline bar. Thresholds are the two
// status tokens the page uses for headroom — warn from 80 %, danger at the cap
// — and are exported so a test can pin them. An unlimited quota reads `∞` and
// draws an empty bar: there is nothing to fill towards.

import { formatCap } from "@/lib/plans";

export const WARN_RATIO = 0.8;
export const DANGER_RATIO = 1;

export function meterFillClass(used: number, cap: number | null): string {
  if (cap === null || cap <= 0) return "bg-text";
  const ratio = used / cap;
  if (ratio >= DANGER_RATIO) return "bg-danger";
  if (ratio >= WARN_RATIO) return "bg-warn";
  return "bg-text";
}

export function Meter({
  label,
  used,
  cap,
}: {
  label: string;
  used: number;
  cap: number | null;
}) {
  const ratio = cap ? Math.min(1, used / cap) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={used}
      aria-valuemin={0}
      aria-valuemax={cap ?? undefined}
      aria-valuetext={`${used.toLocaleString("en-US")} of ${formatCap(cap, "unlimited")}`}
    >
      <div className="flex items-baseline justify-between font-mono text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString("en-US")}
          <span className="text-muted">
            {" / "}
            {formatCap(cap, "∞")}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-border">
        <div
          className={`h-1.5 rounded-full ${meterFillClass(used, cap)}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
