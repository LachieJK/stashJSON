/**
 * The four status classes the Usage page stacks and colours. Pure and
 * dependency-free like `lib/usageFilters.ts`: the client-side charts import
 * this, so it must never pull in `lib/db`. The classing itself happens in
 * SQL (`lib/usage.ts`); this is the vocabulary the results are keyed by.
 *
 * `429` is its own class — the throttled count is a headline figure and a
 * warning, so it is never folded into `4xx`.
 */

export const STATUS_CLASSES = ["2xx", "4xx", "429", "5xx"] as const;
export type StatusClass = (typeof STATUS_CLASSES)[number];
