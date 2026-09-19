/**
 * The four status classes the Usage page stacks and colours. Pure and
 * dependency-free like `lib/usageFilters.ts`: the client-side charts import
 * this, so it must never pull in `lib/db`. The aggregates class in SQL
 * (`lib/usage.ts`), keyed by this vocabulary; `statusClassOf` is the same
 * rule for the one place that classes a single status — the Log's dot.
 *
 * `429` is its own class — the throttled count is a headline figure and a
 * warning, so it is never folded into `4xx`.
 */

export const STATUS_CLASSES = ["2xx", "4xx", "429", "5xx"] as const;
export type StatusClass = (typeof STATUS_CLASSES)[number];

/** The class one status falls in; anything below 400 (1xx–3xx) counts as OK. */
export function statusClassOf(status: number): StatusClass {
  if (status === 429) return "429";
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  return "2xx";
}
