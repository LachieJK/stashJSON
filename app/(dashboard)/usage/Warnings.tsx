import Link from "next/link";
import { ratePerMinute, type Plan } from "@/lib/plans";
import type { ResourceOptions, Warnings as WarningsData } from "@/lib/usage";
import { usageQuery, type UsageFilters } from "@/lib/usageFilters";

/*
 * The two warnings as sentences under the hero — the rule is stated in the
 * text so a reader knows why it fired. Nothing renders when neither did.
 * They are computed from the trailing hour regardless of the controls, so a
 * warning survives any filter; "Show them" is the one link that changes the
 * controls, to the resource and the hour the rule looked at.
 */
export function Warnings({
  warnings,
  filters,
  resources,
  plan,
}: {
  warnings: WarningsData;
  filters: UsageFilters;
  resources: ResourceOptions;
  plan: Plan;
}) {
  if (warnings.probed.length === 0 && warnings.throttled === 0) return null;
  const perMinute = ratePerMinute(plan.policy).toLocaleString("en-US");

  return (
    <ul className="mt-6 flex flex-col gap-2 text-sm">
      {warnings.probed.map((p) => (
        <li key={p.resourceId} className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden />
          <span>
            <b>{resourceName(p.resourceId, resources)}</b> is being probed —{" "}
            {p.refused.toLocaleString("en-US")} refused requests in the last hour from{" "}
            {p.distinctActors} {p.distinctActors === 1 ? "source" : "sources"}. It is private;
            nothing was read.{" "}
            <Link
              href={`/usage?${usageQuery({ ...filters, resource: p.resourceId, range: "1h" })}`}
              className="link"
            >
              Show them
            </Link>
          </span>
        </li>
      ))}
      {warnings.throttled > 0 ? (
        <li className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden />
          <span>
            {warnings.throttled.toLocaleString("en-US")}{" "}
            {warnings.throttled === 1 ? "request was" : "requests were"} <b>throttled</b> in the
            last hour at your {plan.name} rate of {perMinute}/min. Public reads of your documents
            spend the same bucket.{" "}
            <Link href="/pricing" className="link">
              Plans
            </Link>
          </span>
        </li>
      ) : null}
    </ul>
  );
}

/** A workspace by name; a document by id (documents have no name). */
function resourceName(id: string, resources: ResourceOptions): string {
  return resources.workspaces.find((w) => w.id === id)?.name ?? id;
}
