import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/betterAuth";
import { prisma } from "@/lib/db";
import { PLANS, QUOTA_LABELS, ratePerMinute } from "@/lib/plans";
import {
  BUCKET_LABEL,
  actors,
  entries,
  hourlyCounts,
  loadPlanUsage,
  loadResourceOptions,
  resourceRows,
  summary,
  trafficBuckets,
  warnings,
} from "@/lib/usage";
import { parseUsageFilters } from "@/lib/usageFilters";
import { Heatmap, RatePressure, TrafficChart } from "./charts";
import { Hero } from "./Hero";
import { Log } from "./Log";
import { toClientPage } from "./logPage";
import { Meter } from "./Meter";
import { ResourceRows } from "./ResourceRows";
import { UsageControls } from "./UsageControls";
import { UsageSection } from "./UsageSection";
import { Warnings } from "./Warnings";
import { Who } from "./Who";

export const metadata: Metadata = { title: "Usage · StashJSON" };

/*
 * The Usage page — the "Ledger" layout from the prototype (#60): one framed
 * report column in the landing page's texture, read top to bottom. Server
 * component: the controls live in the URL and every number is loaded here.
 *
 * Slice 1 (#61) shipped the shell — frame, controls, Plan section. Slice 2
 * (#62) added the first log-backed pieces: the hero figure and warnings in
 * the header, the Traffic section, and the rate-pressure line in Plan. Slice
 * 3 (#63) added When (the heatmap) and What (per-resource rows); slice 4
 * (#64) closes the column with Who (actors as handles) and the Log.
 */
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, tier: true },
  });
  if (!user) redirect("/login");

  const filters = parseUsageFilters(await searchParams);
  // One clock for every aggregate, so the buckets, the hero and the warnings
  // agree on where "now" is.
  const now = new Date();
  const query = { userId: user.id, ...filters };
  // The rows carry the probed badge from the warnings, so they chain off
  // that one promise rather than waiting for the whole batch.
  const warn = warnings(user.id, now);
  const [resources, usage, buckets, figures, warnData, hours, rows, who, firstPage] =
    await Promise.all([
      loadResourceOptions(user.id),
      loadPlanUsage(user),
      trafficBuckets(query, now),
      summary(query, now),
      warn,
      hourlyCounts(query, now),
      warn.then((w) => resourceRows(query, w, now)),
      actors(query, now),
      entries(query, null, now),
    ]);
  const plan = PLANS[user.tier];
  const price = `$${plan.priceMonthly}/mo`;
  const ceiling = ratePerMinute(plan.policy);
  const peak = Math.max(0, ...buckets.map((b) => b.peakRpm));
  // Client components take plain numbers, not Dates.
  const chartBuckets = buckets.map((b) => ({ ...b, start: b.start.getTime() }));
  const heatRows = hours.map((h) => ({ hourUtc: h.hourUtc.getTime(), count: h.count }));

  return (
    <main className="frame-col my-8">
      <div className="px-6 pt-2 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-base font-semibold">Usage</h1>
          <UsageControls filters={filters} resources={resources} />
        </div>
        <Hero summary={figures} range={filters.range} />
        <Warnings warnings={warnData} filters={filters} resources={resources} plan={plan} />
      </div>

      <UsageSection
        title="Traffic"
        kicker={`requests per ${BUCKET_LABEL[filters.range]}, by status`}
      >
        <TrafficChart data={chartBuckets} range={filters.range} />
      </UsageSection>

      <UsageSection title="Plan" kicker={`${plan.name} · ${price}`}>
        <div className="grid gap-5 sm:grid-cols-3">
          {usage.map((q) => (
            <Meter
              key={q.resource}
              label={capitalise(QUOTA_LABELS[q.resource].many)}
              used={q.used}
              cap={q.cap}
            />
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] text-muted">
          Quotas are checked when something is created; what you already hold
          is never refused.{" "}
          <Link href="/pricing" className="link">
            Change plan →
          </Link>
        </p>
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-[11px] text-muted">
            <span>peak requests per minute, each {BUCKET_LABEL[filters.range]}</span>
            <span>
              peak this range{" "}
              <span className="text-text tabular-nums">{peak.toLocaleString("en-US")}</span> of{" "}
              {ceiling.toLocaleString("en-US")}/min, shared across your API keys
            </span>
          </div>
          <RatePressure data={chartBuckets} range={filters.range} ceiling={ceiling} />
        </div>
      </UsageSection>

      <UsageSection title="When" kicker="requests by hour of day × weekday · your local time">
        <Heatmap rows={heatRows} range={filters.range} />
        <p className="mt-3 font-mono text-[11px] text-muted">
          Quiet hours are when a spike is most likely to be someone else&apos;s traffic.
        </p>
      </UsageSection>

      <UsageSection title="What" kicker="each resource over the range · busiest first">
        <ResourceRows rows={rows} filters={filters} />
      </UsageSection>

      <UsageSection title="Who" kicker="handles are per-owner pseudonyms; no account is identified">
        <Who actors={who} now={now.getTime()} />
      </UsageSection>

      <UsageSection title="Log" kicker="every request in the range · newest first">
        <Log
          initial={toClientPage(firstPage)}
          total={figures.total}
          filters={filters}
          now={now.getTime()}
        />
      </UsageSection>

      {/* Closing rule so the frame's rails end on ticks, not in mid-air. */}
      <div className="section-rule relative">
        <span className="tick tick-tl" aria-hidden />
        <span className="tick tick-tr" aria-hidden />
      </div>
    </main>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
