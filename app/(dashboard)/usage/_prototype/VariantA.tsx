"use client";

/*
 * PROTOTYPE — Variant A "Console".
 * An ops-style grid: KPI row → headline timeline → paired panels → raw log.
 * Everything visible at once; density over narrative. The reader scans.
 */

import { useMemo } from "react";
import {
  API_KEYS,
  CLASSES,
  PLAN,
  ago,
  buckets,
  compact,
  countBy,
  filtered,
  isRefused,
  latencyHist,
  pct,
  percentile,
  resourceName,
  statusClass,
  warnings,
  type Filters,
} from "./data";
import {
  CLASS_COLOR,
  CeilingLine,
  HBars,
  Histogram,
  Legend,
  Meter,
  StackedColumns,
  StatTile,
} from "./charts";
import { Controls } from "./Controls";

export const name = "Console — dense ops grid";

export function VariantA({ filters, set }: { filters: Filters; set: (p: Partial<Filters>) => void }) {
  const es = useMemo(() => filtered(filters), [filters]);
  const bs = useMemo(() => buckets(es, filters.range), [es, filters.range]);
  const w = warnings();
  const errors = es.filter((e) => e.status >= 400 && e.status !== 429).length;
  const throttled = es.filter((e) => e.status === 429).length;
  const durs = es.map((e) => e.durationMs);
  const p50 = percentile(durs, 0.5);
  const p95 = percentile(durs, 0.95);
  const byRoute = countBy(es, (e) => `${e.method} ${e.route}`);
  const byKey = countBy(es.filter((e) => e.apiKey), (e) => e.apiKey);
  const byResource = countBy(es, (e) => e.documentId ?? e.workspaceId).slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Usage</h1>
          <p className="text-sm text-muted">Traffic, errors and plan headroom for your account.</p>
        </div>
        <Controls filters={filters} set={set} />
      </header>

      {(w.probed.length > 0 || w.throttled > 0) && (
        <div className="flex flex-col gap-2">
          {w.probed.map((p) => (
            <button
              key={p.id}
              onClick={() => set({ resource: p.id, range: "1h" })}
              className="notice notice-error cursor-pointer text-left font-mono text-xs"
            >
              <b>Probed</b> · <span className="text-text">{resourceName(p.id)}</span> received {p.refused} refused requests
              in the last hour from {p.actors} {p.actors === 1 ? "source" : "sources"} → view
            </button>
          ))}
          {w.throttled > 0 && (
            <button
              onClick={() => set({ range: "24h", resource: null })}
              className="notice cursor-pointer border-warn text-left font-mono text-xs"
            >
              <b>Throttled</b> · {w.throttled} requests hit your {PLAN.name} rate limit in the last 4 hours. Public reads
              bill your bucket. → view
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <StatTile label="Requests" value={compact(es.length)} trend={bs.map((b) => b.total)} />
        </div>
        <div className="card">
          <StatTile label="Error rate" value={pct(errors, es.length)} sub={`${errors} of ${compact(es.length)}`} trend={bs.map((b) => b.counts["4xx"] + b.counts["5xx"])} />
        </div>
        <div className="card">
          <StatTile label="p95 latency" value={`${p95}ms`} sub={`p50 ${p50}ms`} trend={bs.map((b) => b.p95)} />
        </div>
        <div className="card">
          <StatTile label="Throttled" value={throttled.toLocaleString()} sub="429 responses" trend={bs.map((b) => b.counts["429"])} />
        </div>
      </div>

      <section className="card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Requests by status</h2>
          <Legend />
        </div>
        <StackedColumns data={bs} range={filters.range} height={160} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">Rate-limit pressure</h2>
          <p className="mb-3 font-mono text-[11px] text-muted">Peak requests / minute per bucket, against your plan.</p>
          <CeilingLine data={bs} range={filters.range} ceiling={PLAN.perMinute} width={300} />
        </section>
        <section className="card flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{PLAN.name} plan</h2>
            <a className="link font-mono text-[11px]" href="/pricing">Change plan →</a>
          </div>
          <Meter label="Workspaces" {...PLAN.quotas.workspaces} />
          <Meter label="Documents" {...PLAN.quotas.documents} />
          <Meter label="API keys" {...PLAN.quotas.apiKeys} />
          <Meter label="Rate" used={Math.max(...bs.map((b) => b.peakRpm))} cap={PLAN.perMinute} unit="/min peak" />
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">By route</h2>
          <table className="w-full font-mono text-[11px]">
            <thead className="text-muted">
              <tr className="text-left">
                <th className="pb-1 font-normal">route</th>
                <th className="pb-1 text-right font-normal">req</th>
                <th className="pb-1 pl-3 text-right font-normal">err</th>
                <th className="pb-1 pl-3 text-right font-normal">p95</th>
              </tr>
            </thead>
            <tbody>
              {byRoute.map(([k, xs]) => {
                const err = xs.filter((e) => e.status >= 400 && e.status !== 429).length;
                return (
                  <tr key={k} className="border-t border-border">
                    <td className="py-1.5 pr-2 truncate">{k}</td>
                    <td className="py-1.5 text-right tabular-nums">{xs.length.toLocaleString()}</td>
                    <td className={`py-1.5 pl-3 text-right tabular-nums ${err / xs.length > 0.05 ? "text-danger" : ""}`}>{pct(err, xs.length)}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{percentile(xs.map((e) => e.durationMs), 0.95)}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">By API key</h2>
          <HBars
            rows={API_KEYS.map((k) => {
              const xs = byKey.find(([kk]) => kk === k)?.[1] ?? [];
              const last = xs.length ? ago(xs[xs.length - 1].at) : "never";
              return { key: k, label: k, value: xs.length, note: `· ${pct(xs.length, es.length)} · ${last}` };
            })}
          />
          <p className="mt-3 font-mono text-[11px] text-muted">
            Anonymous / dashboard: {es.filter((e) => !e.apiKey).length.toLocaleString()} requests not attributed to a key.
          </p>
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Top resources</h2>
          <HBars
            onPick={(id) => set({ resource: id })}
            rows={byResource.map(([id, xs]) => {
              const refused = xs.filter(isRefused).length;
              return {
                key: id,
                label: resourceName(id),
                value: xs.length,
                secondary: refused,
                badge: w.probed.some((p) => p.id === id) ? "probed" : undefined,
                note: refused ? `· ${refused} refused` : undefined,
              };
            })}
          />
        </section>
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Latency distribution</h2>
          <Histogram bins={latencyHist(es)} p50={p50} p95={p95} />
        </section>
      </div>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Recent entries</h2>
        <table className="w-full font-mono text-[11px]">
          <thead className="text-muted">
            <tr className="text-left">
              <th className="pb-1 font-normal">when</th>
              <th className="pb-1 font-normal">request</th>
              <th className="pb-1 text-right font-normal">status</th>
              <th className="pb-1 text-right font-normal">ms</th>
              <th className="pb-1 text-right font-normal">who</th>
            </tr>
          </thead>
          <tbody>
            {[...es].reverse().slice(0, 15).map((e, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1 pr-2 text-muted">{ago(e.at)}</td>
                <td className="py-1 pr-2 truncate">
                  {e.method} {e.path}
                </td>
                <td className="py-1 text-right tabular-nums">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: CLASS_COLOR[statusClass(e.status)] }} />
                  {e.status}
                </td>
                <td className="py-1 text-right tabular-nums">{e.durationMs}</td>
                <td className="py-1 text-right">
                  {e.actor === "you" ? `You · ${e.apiKey ?? "dashboard"}` : e.actor ?? "Anonymous"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 font-mono text-[11px] text-muted">
          {CLASSES.map((c) => `${c} ${es.filter((e) => statusClass(e.status) === c).length}`).join(" · ")} · 30-day retention
        </p>
      </section>
    </div>
  );
}
