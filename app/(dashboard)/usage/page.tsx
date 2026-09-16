import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/betterAuth";
import { prisma } from "@/lib/db";
import { PLANS, QUOTA_LABELS } from "@/lib/plans";
import {
  loadPlanUsage,
  loadResourceOptions,
  summary,
  trafficBuckets,
  warnings,
} from "@/lib/usage";
import { parseUsageFilters } from "@/lib/usageFilters";
import { RatePressure, TrafficChart } from "./charts";
import { Hero } from "./Hero";
import { Meter } from "./Meter";
import { UsageControls } from "./UsageControls";
import { UsageSection } from "./UsageSection";
import { Warnings } from "./Warnings";

export const metadata: Metadata = { title: "Usage · StashJSON" };

const BUCKET_LABEL = { "1h": "5 minutes", "24h": "hour", "7d": "6 hours", "30d": "day" } as const;

/*
 * The Usage page — the "Ledger" layout from the prototype (#60): one framed
 * report column in the landing page's texture, read top to bottom. Server
 * component: the controls live in the URL and every number is loaded here.
 *
 * Slice 1 (#61) shipped the shell — frame, controls, Plan section. Slice 2
 * (#62) adds the first log-backed pieces: the hero figure and warnings in
 * the header, the Traffic section, and the rate-pressure line in Plan. When,
 * What, Who and Log are the next two slices and slot in as further
 * <UsageSection>s.
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
  const [resources, usage, buckets, figures, warn] = await Promise.all([
    loadResourceOptions(user.id),
    loadPlanUsage(user),
    trafficBuckets(query, now),
    summary(query, now),
    warnings(user.id, now),
  ]);
  const plan = PLANS[user.tier];
  const price = `$${plan.priceMonthly}/mo`;
  const ceiling = plan.policy.refillPerSecond * 60;
  const peak = Math.max(0, ...buckets.map((b) => b.peakRpm));
  // Client components take plain numbers, not Dates.
  const chartBuckets = buckets.map((b) => ({ ...b, start: b.start.getTime() }));

  return (
    <main className="frame-col my-8">
      <div className="px-6 pt-2 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-base font-semibold">Usage</h1>
          <UsageControls filters={filters} resources={resources} />
        </div>
        <Hero summary={figures} range={filters.range} />
        <Warnings warnings={warn} filters={filters} resources={resources} plan={plan} />
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
