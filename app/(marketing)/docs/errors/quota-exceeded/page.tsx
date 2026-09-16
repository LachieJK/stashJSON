import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, QUOTA_LABELS, QUOTA_RESOURCES, formatCap } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Quota exceeded · StashJSON docs",
};

// The target of the `type` URI in a quota-refusal 403 body
// (https://stashjson.com/docs/errors/quota-exceeded). Like the rate-limit
// anchor, shipping it is the point: a `type` that pointed at nothing would be
// the dangling-URI mistake the wire contract rejected. The table below reads
// from the same `quotas` record the API enforces, so it cannot drift.
export default function QuotaExceededPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Quota exceeded</h1>
      <p className="mt-3 max-w-prose text-muted">
        Each plan caps how many workspaces, documents and API keys an account
        may hold. Creating one more than your plan allows answers{" "}
        <code className="font-mono">403 Forbidden</code> with this body:
      </p>
      <pre className="codeblock mt-3">
        <code>{`{
  "detail": "Plan quota exceeded: your Free plan allows 1 workspace",
  "type": "https://stashjson.com/docs/errors/quota-exceeded"
}`}</code>
      </pre>
      <p className="mt-3 max-w-prose text-muted">
        The <code className="font-mono">type</code> field is how you tell this
        apart from the plain access-denied{" "}
        <code className="font-mono">403</code>, whose body has no{" "}
        <code className="font-mono">type</code>.
      </p>

      <h2 className="mt-10 text-lg font-semibold">Quotas by plan</h2>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-2 pr-4 font-medium">Plan</th>
            {QUOTA_RESOURCES.map((r) => (
              <th key={r} className="py-2 pr-4 font-medium capitalize">
                {QUOTA_LABELS[r].many}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(PLANS).map(([tier, plan]) => (
            <tr key={tier} className="border-b border-border">
              <td className="py-2 pr-4">{plan.name}</td>
              {QUOTA_RESOURCES.map((r) => (
                <td key={r} className="py-2 pr-4 font-mono tabular-nums">
                  {formatCap(plan.quotas[r])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-10 text-lg font-semibold">What a quota does not do</h2>
      <p className="mt-3 max-w-prose text-muted">
        A quota is checked only when something is created. Reading, updating and
        deleting what you already have is never refused, so an account that ends
        up over its cap — after moving to a smaller plan, say — keeps everything
        and is turned away only from new creates until it deletes something or
        upgrades. Documents count towards the cap whether or not they sit in a
        workspace; revoked API keys do not count.
      </p>
      <p className="mt-3 max-w-prose text-muted">
        Your current headroom is on the dashboard&apos;s{" "}
        <Link href="/usage" className="link">
          Usage
        </Link>{" "}
        page; the caps are listed on{" "}
        <Link href="/pricing" className="link">
          Pricing
        </Link>
        .
      </p>
    </div>
  );
}
