"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { AuthTopBarShell } from "./_components";

/*
 * Resolves where "back" goes. A real destination, not history.back(): these
 * pages are linked from emails and typed directly, and a history pop from
 * there lands somewhere useless or off-site.
 *
 * The only case that isn't home is a plan-carrying signup — /signup?plan=pro
 * came from /pricing, so that's where back belongs. Client-side because
 * layouts never receive searchParams; the layout wraps this in <Suspense>
 * with the same shell, so the fallback and the resolved bar are identical
 * except for the label.
 */
export function AuthTopBar() {
  const pathname = usePathname();
  const plan = useSearchParams().get("plan");

  const cameFromPricing = pathname === "/signup" && Boolean(plan);

  return (
    <AuthTopBarShell
      backHref={cameFromPricing ? "/pricing" : "/"}
      backLabel={cameFromPricing ? "Back to pricing" : "Back to home"}
    />
  );
}
