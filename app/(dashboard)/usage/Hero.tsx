import type { TrafficSummary } from "@/lib/usage";
import type { Range } from "@/lib/usageFilters";
import { compact, pct } from "./format";

/*
 * The page's headline: one big requests figure for the range, then the two
 * lines a glance needs — the current rate, and how much of the traffic went
 * wrong. "Errors" are 4xx + 5xx; throttling is counted apart because it is
 * the plan's ceiling at work, not a fault in anyone's request.
 */
export function Hero({ summary, range }: { summary: TrafficSummary; range: Range }) {
  const rpm = Math.round(summary.lastHour / 60);
  return (
    <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-4">
      <div>
        <div className="font-mono text-[11px] text-muted">requests, last {range}</div>
        <div className="text-5xl font-semibold leading-none tabular-nums">
          {compact(summary.total)}
        </div>
      </div>
      <div className="flex flex-col gap-1 pb-1 font-mono text-[11px] text-muted">
        <span>
          <span className="text-text tabular-nums">{rpm.toLocaleString("en-US")}</span> req/min
          over the last hour
        </span>
        <span>
          <span className="text-text tabular-nums">{pct(summary.errors, summary.total)}</span>{" "}
          errors ·{" "}
          <span className="text-text tabular-nums">
            {summary.throttled.toLocaleString("en-US")}
          </span>{" "}
          throttled
        </span>
      </div>
    </div>
  );
}
