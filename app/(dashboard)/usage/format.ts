/**
 * Number formatting for the Usage page's figures. Pure, shared by the server
 * hero and the client charts.
 */

/** `1,234` up to five digits, then `12.3K` — the hero should never wrap. */
export function compact(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString("en-US");
}

/** `a` as a share of `b`; one decimal below 10 % so a small error rate is not rounded to 0 %. */
export function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  const ratio = a / b;
  return `${(100 * ratio).toFixed(ratio < 0.1 && ratio > 0 ? 1 : 0)}%`;
}

/**
 * `12s ago`, `3m ago`, `5h ago`, `2d ago` — relative to an explicit `now`,
 * so the server pass and hydration agree on every label.
 */
export function ago(atMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
