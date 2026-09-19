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
 *
 * `nowMs` is the clock the page was rendered with: every later page is cut
 * from the same `[now - range, now)` window as the first, so the range does
 * not slide forward under the reader and the footer's count stays honest.
 * It is clamped to the real clock — a future "now" would only widen the
 * window, but there is no reason to let it.
 */
export async function loadMoreEntries(
  filters: UsageFilters,
  cursor: string | null,
  nowMs: number,
): Promise<ClientLogPage> {
  const session = await getServerSession();
  if (!session) throw new Error("Not signed in");
  const clean = parseUsageFilters({
    range: filters.range,
    cred: filters.cred,
    resource: filters.resource ?? undefined,
  });
  const now = new Date(Number.isFinite(nowMs) && nowMs < Date.now() ? nowMs : Date.now());
  const page = await entries({ userId: session.user.id, ...clean }, cursor, now);
  return toClientPage(page);
}
