"use client";

/*
 * PROTOTYPE — Variant C "Explorer".
 * Filter-first split view: a resource tree on the left IS the resource
 * filter; the right pane is "everything about the selected thing". The
 * legend is clickable to emphasise one status class. Built for drilling
 * down, not for a glance.
 */

import { useMemo, useState } from "react";
import {
  DOCUMENTS,
  PLAN,
  WORKSPACES,
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
  type StatusClass,
  CLASSES,
} from "./data";
import { CLASS_COLOR, CLASS_LABEL, CeilingLine, HBars, Histogram, Meter, StackedColumns, Strip } from "./charts";
import { Controls } from "./Controls";

export const name = "Explorer — resource tree + drilldown";

export function VariantC({ filters, set }: { filters: Filters; set: (p: Partial<Filters>) => void }) {
  const [emph, setEmph] = useState<StatusClass | undefined>();
  const all = useMemo(() => filtered({ ...filters, resource: null }), [filters]);
  const es = useMemo(() => filtered(filters), [filters]);
  const bs = useMemo(() => buckets(es, filters.range), [es, filters.range]);
  const w = warnings();
  const durs = es.map((e) => e.durationMs);
  const p50 = percentile(durs, 0.5);
  const p95 = percentile(durs, 0.95);
  const byActor = countBy(es, (e) => (e.actor === "you" ? `You · ${e.apiKey ?? "dashboard"}` : (e.actor ?? "Anonymous")));
  const byMethod = countBy(es, (e) => e.method);
  const selectedDoc = DOCUMENTS.find((d) => d.id === filters.resource);
  const selectedWs = WORKSPACES.find((x) => x.id === filters.resource);
  const title = selectedDoc?.name ?? (selectedWs ? `${selectedWs.name}/` : "All resources");

  const quotaHot = Object.values(PLAN.quotas).some((q) => q.used / q.cap >= 0.8);

  return (
    <div className="-mx-6 flex flex-col gap-0">
      {/* Thin plan bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-6 pb-3 font-mono text-[11px] text-muted">
        <span className="text-text">{PLAN.name}</span>
        {(["workspaces", "documents", "apiKeys"] as const).map((k) => {
          const q = PLAN.quotas[k];
          const hot = q.used / q.cap >= 0.8;
          return (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`inline-block h-1.5 w-12 rounded-full bg-border`}>
                <span className={`block h-1.5 rounded-full ${hot ? "bg-warn" : "bg-text"}`} style={{ width: `${(q.used / q.cap) * 100}%` }} />
              </span>
              {k === "apiKeys" ? "keys" : k} <span className="text-text tabular-nums">{compact(q.used)}</span>/{compact(q.cap)}
            </span>
          );
        })}
        <span>
          rate <span className="text-text tabular-nums">{Math.max(...buckets(all, filters.range).map((b) => b.peakRpm))}</span>/{PLAN.perMinute} peak
        </span>
        {quotaHot && <a href="/pricing" className="link ml-auto">Upgrade →</a>}
      </div>

      <div className="grid md:grid-cols-[220px_1fr]">
        {/* Left rail: resource tree = the resource filter */}
        <nav className="border-b border-border px-4 py-4 font-mono text-[11px] md:border-r md:border-b-0">
          <button
            onClick={() => set({ resource: null })}
            aria-current={!filters.resource}
            className="flex w-full cursor-pointer justify-between rounded px-2 py-1 hover:bg-panel-2 aria-[current=true]:bg-panel-2"
          >
            <span>All resources</span>
            <span className="text-muted tabular-nums">{compact(all.length)}</span>
          </button>
          {WORKSPACES.map((ws) => {
            const n = all.filter((e) => e.workspaceId === ws.id).length;
            return (
              <div key={ws.id} className="mt-3">
                <button
                  onClick={() => set({ resource: ws.id })}
                  aria-current={filters.resource === ws.id}
                  className="flex w-full cursor-pointer justify-between rounded px-2 py-1 text-text hover:bg-panel-2 aria-[current=true]:bg-panel-2"
                >
                  <span>{ws.name}/</span>
                  <span className="text-muted tabular-nums">{compact(n)}</span>
                </button>
                {DOCUMENTS.filter((d) => d.ws === ws.id).map((d) => {
                  const xs = all.filter((e) => e.documentId === d.id);
                  const refused = xs.filter(isRefused).length;
                  const probed = w.probed.some((p) => p.id === d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => set({ resource: d.id })}
                      aria-current={filters.resource === d.id}
                      className="flex w-full cursor-pointer items-center gap-1.5 rounded py-1 pr-2 pl-5 text-muted hover:bg-panel-2 hover:text-text aria-[current=true]:bg-panel-2 aria-[current=true]:text-text"
                    >
                      <span className="truncate">{d.name}</span>
                      {probed && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" title="probed" />}
                      {!probed && refused > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="refused requests" />}
                      <span className="ml-auto tabular-nums">{compact(xs.length)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div className="mt-4 border-t border-border pt-3 text-muted">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-danger" />probed
            <span className="mr-2 ml-3 inline-block h-1.5 w-1.5 rounded-full bg-warn" />refused
          </div>
        </nav>

        {/* Right pane */}
        <div className="flex flex-col gap-5 px-6 py-4">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold">{title}</h1>
              <p className="font-mono text-[11px] text-muted">
                {compact(es.length)} requests · {pct(es.filter((e) => e.status >= 400 && e.status !== 429).length, es.length)} errors · p95{" "}
                {p95}ms
                {selectedDoc?.isPublic && " · public: reads bill your rate limit"}
              </p>
            </div>
            <Controls filters={filters} set={set} showResource={false} />
          </header>

          {w.probed.some((p) => p.id === filters.resource) && (
            <div className="notice notice-error font-mono text-xs">
              <b>Probed.</b> {w.probed.find((p) => p.id === filters.resource)!.refused} refused requests in the last hour. This document
              is private; every one of them was turned away.
            </div>
          )}

          <Strip
            parts={CLASSES.map((c) => ({
              label: `${c} ${CLASS_LABEL[c]}`,
              value: es.filter((e) => statusClass(e.status) === c).length,
              color: CLASS_COLOR[c],
            }))}
          />

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Over time</h2>
              <ul className="flex gap-1 font-mono text-[11px]">
                {CLASSES.map((c) => (
                  <li key={c}>
                    <button
                      onClick={() => setEmph(emph === c ? undefined : c)}
                      aria-pressed={emph === c}
                      className="flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-1.5 py-0.5 text-muted hover:text-text aria-pressed:border-border aria-pressed:text-text"
                    >
                      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: CLASS_COLOR[c] }} />
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <StackedColumns data={bs} range={filters.range} emphasis={emph} height={150} />
          </section>

          <div className="grid gap-5 sm:grid-cols-2">
            <section>
              <h2 className="mb-2 text-sm font-semibold">Who</h2>
              <HBars
                rows={byActor.slice(0, 7).map(([k, xs]) => ({
                  key: k,
                  label: k,
                  value: xs.length,
                  secondary: xs.filter(isRefused).length,
                  note: `· ${ago(xs[xs.length - 1].at)}`,
                }))}
              />
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold">Methods</h2>
              <HBars rows={byMethod.map(([k, xs]) => ({ key: k, label: k, value: xs.length, note: `· ${pct(xs.length, es.length)}` }))} />
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold">Latency</h2>
              <Histogram bins={latencyHist(es)} p50={p50} p95={p95} />
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold">Rate pressure</h2>
              <CeilingLine data={buckets(all, filters.range)} range={filters.range} ceiling={PLAN.perMinute} height={100} width={300} />
              {filters.resource && (
                <p className="mt-1 font-mono text-[11px] text-muted">Whole-account peak; the limit is per account, not per resource.</p>
              )}
            </section>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Entries</h2>
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {[...es].reverse().slice(0, 20).map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-3 text-muted">{ago(e.at)}</td>
                    <td className="py-1 pr-3">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: CLASS_COLOR[statusClass(e.status)] }} />
                      {e.status}
                    </td>
                    <td className="py-1 pr-3">{e.method}</td>
                    <td className="w-full py-1 pr-3"><div className="max-w-[16rem] truncate">{filters.resource ? e.route : resourceName(e.documentId ?? e.workspaceId)}</div></td>
                    <td className="py-1 pr-3 text-right tabular-nums">{e.durationMs}ms</td>
                    <td className="py-1 text-right">{e.actor === "you" ? `You · ${e.apiKey ?? "dashboard"}` : e.actor ?? "Anonymous"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
