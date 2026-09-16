/**
 * The four status classes the Usage page stacks and colours. Pure and
 * dependency-free like `lib/usageFilters.ts`: the client-side charts import
 * this, so it must never pull in `lib/db`. The aggregates that produce the
 * counts live in `lib/usage.ts`.
 *
 * `429` is its own class — the throttled count is a headline figure and a
 * warning, so it is never folded into `4xx`.
 */

export const STATUS_CLASSES = ["2xx", "4xx", "429", "5xx"] as const;
export type StatusClass = (typeof STATUS_CLASSES)[number];

export function statusClass(status: number): StatusClass {
  if (status === 429) return "429";
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  return "2xx";
}
