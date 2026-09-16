import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/betterAuth";
import { prisma } from "@/lib/db";
import { PLANS, QUOTA_LABELS } from "@/lib/plans";
import { loadPlanUsage, loadResourceOptions } from "@/lib/usage";
import { parseUsageFilters } from "@/lib/usageFilters";
import { Meter } from "./Meter";
import { UsageControls } from "./UsageControls";
import { UsageSection } from "./UsageSection";

export const metadata: Metadata = { title: "Usage · StashJSON" };

/*
 * The Usage page — the "Ledger" layout from the prototype (#60): one framed
 * report column in the landing page's texture, read top to bottom. Server
 * component: the controls live in the URL and every number is loaded here.
 *
 * Slice 1 (#61) ships the shell — frame, controls, Plan section. The sections
 * that read the access log (Traffic + warnings, When, What, Who, Log) are the
 * next three slices and slot in as further <UsageSection>s.
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
  const [resources, usage] = await Promise.all([
    loadResourceOptions(user.id),
    loadPlanUsage(user),
  ]);
  const plan = PLANS[user.tier];
  const price = `$${plan.priceMonthly}/mo`;

  return (
    <main className="frame-col my-8">
      <div className="px-6 pt-2 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-base font-semibold">Usage</h1>
          <UsageControls filters={filters} resources={resources} />
        </div>
      </div>

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
