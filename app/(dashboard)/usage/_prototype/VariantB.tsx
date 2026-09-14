"use client";

/*
 * PROTOTYPE — Variant B "Ledger".
 * A single framed column read top-to-bottom like a report: a hero figure and
 * plain-language warnings, then the plan, then "when", "what", "who", and
 * finally the log rendered as monospace lines. Rails and ticks from the
 * landing-page texture system; no cards.
 */

import { useMemo } from "react";
import {
  DOCUMENTS,
  PLAN,
  WORKSPACES,
  ago,
  buckets,
  compact,
  countBy,
  filtered,
  heat,
  isRefused,
  pct,
  resourceName,
  warnings,
  type Filters,
} from "./data";
import { CLASS_COLOR, Heatmap, Meter, Sparkline, Strip } from "./charts";
import { Controls } from "./Controls";

export const name = "Ledger — narrative report column";

function Section({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section className="relative border-t border-border px-6 py-6">
      <span className="tick tick-tl" aria-hidden />
      <span className="tick tick-tr" aria-hidden />
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {kicker && <span className="font-mono text-[11px] text-muted">{kicker}</span>}
      </div>
      {children}
    </section>
  );
}

export function VariantB({ filters, set }: { filters: Filters; set: (p: Partial<Filters>) => void }) {
  const es = useMemo(() => filtered(filters), [filters]);
  const bs = useMemo(() => buckets(es, filters.range), [es, filters.range]);
  const w = warnings();
  const lastHour = es.filter((e) => e.at >= es[es.length - 1]?.at - 3600e3);
  const rpmNow = Math.round(lastHour.length / 60);
  const errors = es.filter((e) => e.status >= 400 && e.status !== 429).length;
  const byActor = countBy(es, (e) => e.actor ?? "anon");
  const you = byActor.find(([k]) => k === "you")?.[1].length ?? 0;
  const anon = byActor.find(([k]) => k === "anon")?.[1].length ?? 0;
  const others = byActor.filter(([k]) => k !== "you" && k !== "anon");

  return (
    <div className="-mx-6 border-x border-border">
      <div className="px-6 pt-2 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-base font-semibold">Usage</h1>
          <Controls filters={filters} set={set} />
        </div>
        <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="font-mono text-[11px] text-muted">requests, last {filters.range}</div>
            <div className="text-5xl font-semibold leading-none">{compact(es.length)}</div>
          </div>
          <div className="flex flex-col gap-1 pb-1 font-mono text-[11px] text-muted">
            <span>
              <span className="text-text tabular-nums">{rpmNow}</span> req/min over the last hour
            </span>
            <span>
              <span className="text-text tabular-nums">{pct(errors, es.length)}</span> errors ·{" "}
              <span className="text-text tabular-nums">{es.filter((e) => e.status === 429).length}</span> throttled
            </span>
          </div>
          <div className="pb-1">
            <Sparkline values={bs.map((b) => b.total)} width={160} height={36} />
          </div>
        </div>

        {(w.probed.length > 0 || w.throttled > 0) && (
          <ul className="mt-6 flex flex-col gap-2 text-sm">
            {w.probed.map((p) => (
              <li key={p.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
                <span>
                  <b>{resourceName(p.id)}</b> is being probed — {p.refused} refused requests in the last hour from{" "}
                  {p.actors} {p.actors === 1 ? "source" : "sources"}. It is private; nothing was read.{" "}
                  <button className="link" onClick={() => set({ resource: p.id, range: "1h" })}>Show them</button>
                </span>
              </li>
            ))}
            {w.throttled > 0 && (
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn" />
                <span>
                  {w.throttled} requests were <b>throttled</b> at your {PLAN.name} rate of {PLAN.perMinute}/min. Most were
                  anonymous public reads of <b>products.json</b> — they spend your bucket.{" "}
                  <a className="link" href="/pricing">Plans</a>
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      <Section title="Plan" kicker={`${PLAN.name} · $19/mo`}>
        <div className="grid gap-5 sm:grid-cols-3">
          <Meter label="Workspaces" {...PLAN.quotas.workspaces} />
          <Meter label="Documents" {...PLAN.quotas.documents} />
          <Meter label="API keys" {...PLAN.quotas.apiKeys} />
        </div>
        <p className="mt-4 font-mono text-[11px] text-muted">
          Peak this range: <span className="text-text">{Math.max(...bs.map((b) => b.peakRpm))}</span> req/min of{" "}
          {PLAN.perMinute}. Rate is shared across your {PLAN.quotas.apiKeys.used} keys.
        </p>
      </Section>

      <Section title="When" kicker="requests by hour of day × day of week (UTC)">
        <Heatmap grid={heat(es)} />
        <p className="mt-3 font-mono text-[11px] text-muted">
          Quiet hours are when a spike is most likely to be someone else&apos;s traffic.
        </p>
      </Section>

      <Section title="What" kicker="each resource over the range">
        <ul className="flex flex-col">
          {WORKSPACES.map((ws) => {
            const wsEntries = es.filter((e) => e.workspaceId === ws.id);
            return (
              <li key={ws.id} className="border-t border-border py-3 first:border-t-0">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <button className="link" onClick={() => set({ resource: ws.id })}>{ws.name}/</button>
                  <span className="text-muted tabular-nums">{wsEntries.length.toLocaleString()}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {DOCUMENTS.filter((d) => d.ws === ws.id).map((d) => {
                    const xs = es.filter((e) => e.documentId === d.id);
                    const refused = xs.filter(isRefused).length;
                    const probed = w.probed.some((p) => p.id === d.id);
                    const trend = buckets(xs, filters.range).map((b) => b.total);
                    return (
                      <li key={d.id} className="flex items-center gap-3 font-mono text-[11px]">
                        <Sparkline values={trend} width={72} height={18} accentLast={false} />
                        <button className="cursor-pointer truncate hover:underline" onClick={() => set({ resource: d.id })}>
                          {d.name}
                        </button>
                        {d.isPublic && <span className="pill pill-public text-[10px]">public</span>}
                        {probed && <span className="rounded-sm border border-danger px-1 text-[10px] text-danger">probed</span>}
                        <span className="ml-auto tabular-nums">{xs.length.toLocaleString()}</span>
                        <span className={`w-16 text-right tabular-nums ${refused ? "text-warn" : "text-muted"}`}>
                          {refused ? `${refused} refused` : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Who" kicker="handles are per-owner pseudonyms; no account is identified">
        <Strip
          parts={[
            { label: "You", value: you, color: "var(--color-text)" },
            { label: "Other accounts", value: others.reduce((a, [, xs]) => a + xs.length, 0), color: "var(--color-info)" },
            { label: "Anonymous", value: anon, color: "var(--color-muted)" },
          ]}
        />
        {others.length > 0 && (
          <ul className="mt-4 grid gap-x-8 gap-y-1 font-mono text-[11px] sm:grid-cols-2">
            {others.map(([h, xs]) => {
              const refused = xs.filter(isRefused).length;
              return (
                <li key={h} className="flex justify-between border-t border-border py-1.5">
                  <span>{h}</span>
                  <span className="tabular-nums">
                    {xs.length} <span className={refused ? "text-warn" : "text-muted"}>· {refused} refused</span>{" "}
                    <span className="text-muted">· {ago(xs[xs.length - 1].at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Log" kicker={`${es.length.toLocaleString()} entries · newest first · 30-day retention`}>
        <pre className="codeblock max-h-80 overflow-auto text-[11px] leading-5">
          {[...es]
            .reverse()
            .slice(0, 40)
            .map((e) => {
              const who = e.actor === "you" ? `you/${e.apiKey ?? "dash"}` : (e.actor ?? "anon");
              return (
                <div key={e.at + e.path} className="flex gap-3">
                  <span className="w-14 shrink-0 text-muted">{ago(e.at)}</span>
                  <span className="w-3 shrink-0" style={{ color: CLASS_COLOR[e.status === 429 ? "429" : e.status >= 500 ? "5xx" : e.status >= 400 ? "4xx" : "2xx"] }}>
                    ●
                  </span>
                  <span className="w-8 shrink-0">{e.status}</span>
                  <span className="w-12 shrink-0">{e.method}</span>
                  <span className="min-w-0 flex-1 truncate">{e.path}</span>
                  <span className="w-12 shrink-0 text-right text-muted">{e.durationMs}ms</span>
                  <span className="w-28 shrink-0 text-right">{who}</span>
                </div>
              );
            })}
        </pre>
      </Section>
    </div>
  );
}
