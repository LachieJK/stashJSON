/**
 * The Usage page's three URL controls — range, credential, resource. Pure and
 * dependency-free on purpose: the client-side controls import this file, so it
 * must never pull in `lib/db`. The loaders that use these live in `lib/usage.ts`.
 *
 * All state is in the query string so a view is shareable and the back button
 * works.
 */

export const RANGES = ["1h", "24h", "7d", "30d"] as const;
export type Range = (typeof RANGES)[number];

/** Which credential identified the actor; `all` is the unfiltered view. */
export const CREDS = ["all", "api_key", "session", "none"] as const;
export type CredFilter = (typeof CREDS)[number];

export type UsageFilters = {
  range: Range;
  cred: CredFilter;
  /** A workspace or document id to scope every section to, or null for all. */
  resource: string | null;
};

/** 7d is the default: the only range where the heatmap is complete on arrival. */
export const DEFAULT_RANGE: Range = "7d";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Read the controls from `searchParams`, falling back to defaults for anything unrecognised. */
export function parseUsageFilters(params: SearchParams): UsageFilters {
  const range = first(params.range);
  const cred = first(params.cred);
  const resource = first(params.resource);
  return {
    range: (RANGES as readonly string[]).includes(range ?? "")
      ? (range as Range)
      : DEFAULT_RANGE,
    cred: (CREDS as readonly string[]).includes(cred ?? "")
      ? (cred as CredFilter)
      : "all",
    resource: resource ? resource : null,
  };
}

/** The query string for a set of filters, with defaults omitted so `/usage` stays clean. */
export function usageQuery(filters: UsageFilters): string {
  const q = new URLSearchParams();
  if (filters.range !== DEFAULT_RANGE) q.set("range", filters.range);
  if (filters.cred !== "all") q.set("cred", filters.cred);
  if (filters.resource) q.set("resource", filters.resource);
  return q.toString();
}
