"use server";

import { getServerSession } from "@/lib/betterAuth";
import { entries } from "@/lib/usage";
import { parseUsageFilters, type UsageFilters } from "@/lib/usageFilters";
import { toClientPage, type ClientLogPage } from "./logPage";

/**
 * The Log's "Load more": the next page of entries under the same filters. A
 * Server Action rather than a route, keeping the decision in #60 — there is
 * no `/api/usage/*`, and this is callable only from the page's own bundle.
 * The session is checked here, not trusted from the caller, and the filters
 * are re-parsed so nothing but the three known controls reaches the query.
 */
export async function loadMoreEntries(
  filters: UsageFilters,
  cursor: string | null,
): Promise<ClientLogPage> {
  const session = await getServerSession();
  if (!session) throw new Error("Not signed in");
  const clean = parseUsageFilters({
    range: filters.range,
    cred: filters.cred,
    resource: filters.resource ?? undefined,
  });
  const page = await entries(
    { userId: session.user.id, ...clean },
    typeof cursor === "string" ? cursor : null,
  );
  return toClientPage(page);
}
