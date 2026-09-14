"use client";

/*
 * PROTOTYPE ONLY — hand-rolled SVG chart primitives shared by the variants.
 * Token colours only; marks thin; a 2px surface gap between stacked
 * segments; hover tooltip on every mark. Text never wears a series colour.
 */

import { useState, type ReactNode } from "react";
import {
  CLASSES,
  LAT_BINS,
  type Bucket,
  type Range,
  type StatusClass,
  fmtTime,
} from "./data";

export const CLASS_COLOR: Record<StatusClass, string> = {
  "2xx": "var(--color-text)",
  "4xx": "var(--color-warn)",
  "429": "var(--color-info)",
  "5xx": "var(--color-danger)",
};
export const CLASS_LABEL: Record<StatusClass, string> = {
  "2xx": "OK",
  "4xx": "Client error",
  "429": "Throttled",
  "5xx": "Server error",
};

export function Legend({ only }: { only?: StatusClass[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
      {(only ?? CLASSES).map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ background: CLASS_COLOR[c] }}
          />
          {c} · {CLASS_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}

function Tip({ x, y, children }: { x: number | string; y: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded border border-border bg-panel-2 px-2 py-1 font-mono text-[11px] whitespace-nowrap shadow"
      style={{ left: x, top: y, transform: "translate(-50%, calc(-100% - 8px))" }}
    >
      {children}
    </div>
  );
}

/** Stacked columns per bucket: 2xx / 4xx / 429 / 5xx. */
export function StackedColumns({
  data,
  range,
  height = 140,
  width = 600,
  emphasis,
}: {
  data: Bucket[];
  range: Range;
  height?: number;
  /** viewBox width — use ~300 for a half-width card so text stays legible. */
  width?: number;
  /** Highlight one class; others drop to muted. */
  emphasis?: StatusClass;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = width;
  const padL = 32;
  const padB = 18;
  const max = Math.max(1, ...data.map((b) => b.total));
  const nice = niceMax(max);
  const slot = (W - padL) / data.length;
  const bw = Math.min(24, slot * 0.7);
  const padT = 8;
  const plotH = height - padB;
  const y = (v: number) => padT + (plotH - padT) - (v / nice) * (plotH - padT);
  const ticks = [0, nice / 2, nice];
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" style={{ height }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--color-muted)" fontFamily="var(--font-mono)">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {data.map((b, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          let acc = 0;
          return (
            <g key={b.t} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={0} width={slot} height={plotH} fill="transparent" />
              {CLASSES.map((c) => {
                const v = b.counts[c];
                if (!v) return null;
                const y0 = y(acc + v);
                const h = Math.max(0, y(acc) - y0 - 2);
                acc += v;
                const dim = emphasis && emphasis !== c;
                return (
                  <rect
                    key={c}
                    x={x}
                    y={y0}
                    width={bw}
                    height={h}
                    rx={2}
                    fill={dim ? "var(--color-border)" : CLASS_COLOR[c]}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                );
              })}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={height - 4} textAnchor="middle" fontSize={9} fill="var(--color-muted)" fontFamily="var(--font-mono)">
                  {fmtTime(b.t, range)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tip x={`${((padL + hover * slot + slot / 2) / W) * 100}%`} y={0}>
          <div className="text-muted">{fmtTime(data[hover].t, range)}</div>
          <div className="text-text">{data[hover].total.toLocaleString()} requests</div>
          {CLASSES.filter((c) => data[hover].counts[c]).map((c) => (
            <div key={c} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: CLASS_COLOR[c] }} />
              {c} {data[hover].counts[c]}
            </div>
          ))}
        </Tip>
      )}
    </div>
  );
}

/** A peak-per-bucket line against a flat ceiling (the plan's rate). */
export function CeilingLine({
  data,
  range,
  ceiling,
  height = 120,
  width = 600,
}: {
  data: Bucket[];
  range: Range;
  ceiling: number;
  height?: number;
  width?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = width;
  const padL = 32;
  const padB = 18;
  const plotH = height - padB;
  const max = Math.max(ceiling * 1.1, ...data.map((b) => b.peakRpm));
  const y = (v: number) => plotH - (v / max) * plotH;
  const x = (i: number) => padL + (i / Math.max(1, data.length - 1)) * (W - padL - 4);
  const d = data.map((b, i) => `${i ? "L" : "M"}${x(i)},${y(b.peakRpm)}`).join(" ");
  const area = `${d} L${x(data.length - 1)},${plotH} L${x(0)},${plotH} Z`;
  const over = data.some((b) => b.peakRpm >= ceiling);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" style={{ height }}>
        <line x1={padL} x2={W} y1={plotH} y2={plotH} stroke="var(--color-border)" />
        <line x1={padL} x2={W} y1={y(ceiling)} y2={y(ceiling)} stroke={over ? "var(--color-danger)" : "var(--color-warn)"} strokeWidth={1} />
        <text x={W - 2} y={y(ceiling) - 4} textAnchor="end" fontSize={9} fill="var(--color-muted)" fontFamily="var(--font-mono)">
          plan ceiling {ceiling}/min
        </text>
        <path d={area} fill="var(--color-text)" opacity={0.08} />
        <path d={d} fill="none" stroke="var(--color-text)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((b, i) => (
          <g key={b.t} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - (W - padL) / data.length / 2} y={0} width={(W - padL) / data.length} height={plotH} fill="transparent" />
            {(hover === i || b.peakRpm >= ceiling) && (
              <circle cx={x(i)} cy={y(b.peakRpm)} r={4} fill={b.peakRpm >= ceiling ? "var(--color-danger)" : "var(--color-text)"} stroke="var(--color-panel)" strokeWidth={2} />
            )}
          </g>
        ))}
        <text x={padL - 6} y={y(0) + 3} textAnchor="end" fontSize={9} fill="var(--color-muted)" fontFamily="var(--font-mono)">0</text>
        <text x={padL - 6} y={y(ceiling) + 3} textAnchor="end" fontSize={9} fill="var(--color-muted)" fontFamily="var(--font-mono)">{ceiling}</text>
      </svg>
      {hover !== null && (
        <Tip x={`${(x(hover) / W) * 100}%`} y={0}>
          <div className="text-muted">{fmtTime(data[hover].t, range)}</div>
          <div>peak {data[hover].peakRpm} req/min</div>
        </Tip>
      )}
    </div>
  );
}

export function Sparkline({
  values,
  width = 96,
  height = 24,
  accentLast = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  accentLast?: boolean;
}) {
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={width} height={height} className="block shrink-0">
      <path d={d} fill="none" stroke="var(--color-muted)" strokeWidth={1.5} strokeLinejoin="round" />
      {accentLast && <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="var(--color-text)" />}
    </svg>
  );
}

/** Quota meter: fill carries severity; track is a step of the same ramp. */
export function Meter({ used, cap, label, unit }: { used: number; cap: number | null; label: string; unit?: string }) {
  const ratio = cap ? used / cap : 0;
  const color = ratio >= 1 ? "var(--color-danger)" : ratio >= 0.8 ? "var(--color-warn)" : "var(--color-text)";
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString()}
          <span className="text-muted"> / {cap ? cap.toLocaleString() : "∞"}{unit ? ` ${unit}` : ""}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-border">
        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** 7 × 24 heatmap; single hue, more-is-darker via opacity. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const max = Math.max(1, ...grid.flat());
  const cell = 20;
  const gap = 2;
  const padL = 30;
  const padT = 14;
  const W = padL + 24 * (cell + gap);
  const H = padT + 7 * (cell + gap);
  return (
    <div className="relative overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ maxWidth: W }}>
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={padL + h * (cell + gap) + cell / 2} y={9} textAnchor="middle" fontSize={8} fill="var(--color-muted)" fontFamily="var(--font-mono)">
            {String(h).padStart(2, "0")}
          </text>
        ))}
        {grid.map((row, d) => (
          <g key={d}>
            <text x={padL - 6} y={padT + d * (cell + gap) + cell / 2 + 3} textAnchor="end" fontSize={8} fill="var(--color-muted)" fontFamily="var(--font-mono)">
              {DAYS[d]}
            </text>
            {row.map((v, h) => (
              <rect
                key={h}
                x={padL + h * (cell + gap)}
                y={padT + d * (cell + gap)}
                width={cell}
                height={cell}
                rx={2}
                fill="var(--color-text)"
                opacity={v === 0 ? 0.06 : 0.15 + 0.85 * (v / max)}
                onMouseEnter={() => setHover([d, h])}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>
        ))}
      </svg>
      {hover && (
        <Tip x={`${((padL + hover[1] * (cell + gap) + cell / 2) / W) * 100}%`} y={0}>
          {DAYS[hover[0]]} {String(hover[1]).padStart(2, "0")}:00 · {grid[hover[0]][hover[1]]} requests
        </Tip>
      )}
    </div>
  );
}

/** Horizontal bars, labelled at the tip; optional secondary (refused) segment. */
export function HBars({
  rows,
  onPick,
}: {
  rows: { key: string; label: string; value: number; secondary?: number; badge?: string; note?: string }[];
  onPick?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onPick?.(r.key)}
            className={`group block w-full text-left ${onPick ? "cursor-pointer" : "cursor-default"}`}
          >
            <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
              <span className="truncate">
                {r.label}
                {r.badge && (
                  <span className="ml-2 rounded-sm border border-warn px-1 text-[10px] text-warn">{r.badge}</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">
                {r.value.toLocaleString()}
                {r.note && <span className="text-muted"> {r.note}</span>}
              </span>
            </div>
            <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div className="h-1.5 bg-text group-hover:opacity-80" style={{ width: `${((r.value - (r.secondary ?? 0)) / max) * 100}%` }} />
              {r.secondary ? (
                <div className="ml-[2px] h-1.5 bg-warn" style={{ width: `${(r.secondary / max) * 100}%` }} />
              ) : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Latency histogram over LAT_BINS. */
export function Histogram({ bins, p50, p95 }: { bins: number[]; p50: number; p95: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 90;
  const padB = 16;
  const max = Math.max(1, ...bins);
  const slot = W / bins.length;
  const bw = Math.min(24, slot * 0.7);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: H }}>
        {bins.map((v, i) => {
          const h = (v / max) * (H - padB - 4);
          const x = i * slot + (slot - bw) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y={0} width={slot} height={H - padB} fill="transparent" />
              <rect x={x} y={H - padB - h} width={bw} height={h} rx={2} fill="var(--color-text)" opacity={hover === null || hover === i ? 1 : 0.5} />
              <text x={i * slot + slot / 2} y={H - 4} textAnchor="middle" fontSize={8} fill="var(--color-muted)" fontFamily="var(--font-mono)">
                {LAT_BINS[i]}{i === bins.length - 1 ? "+" : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
        <span>ms</span>
        <span>
          p50 <span className="text-text">{p50}ms</span> · p95 <span className="text-text">{p95}ms</span>
        </span>
      </div>
      {hover !== null && (
        <Tip x={`${(((hover + 0.5) * slot) / W) * 100}%`} y={0}>
          {LAT_BINS[hover]}–{LAT_BINS[hover + 1] ?? "∞"} ms · {bins[hover]} requests
        </Tip>
      )}
    </div>
  );
}

/** A part-to-whole strip: one bar, labelled segments. */
export function Strip({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1, parts.reduce((a, p) => a + p.value, 0));
  return (
    <div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
            {p.label} <span className="text-text tabular-nums">{p.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatTile({ label, value, sub, trend }: { label: string; value: string; sub?: ReactNode; trend?: number[] }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="font-mono text-[11px] whitespace-nowrap text-muted">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold leading-none">{value}</div>
        {sub && <div className="mt-1 font-mono text-[11px] text-muted">{sub}</div>}
      </div>
      {trend && <Sparkline values={trend} width={64} height={22} />}
    </div>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
