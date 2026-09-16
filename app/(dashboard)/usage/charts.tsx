"use client";

/*
 * The Usage page's charts: hand-rolled inline SVG, token colours only
 * (decision in #60 — no chart dependency). Marks are thin, stacked segments
 * and heatmap cells keep a 2px surface gap, every mark has a hover tooltip
 * (the sparkline excepted — its row states the figures), and text never
 * wears a series colour. Lifted from `charts.tsx` on `prototype/usage-page`.
 *
 * Buckets arrive from the server with epoch-ms starts; labels are formatted
 * in the viewer's zone once mounted (UTC on the server pass, so hydration
 * matches and then re-renders locally).
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { STATUS_CLASSES, type StatusClass } from "@/lib/statusClass";
import type { Range } from "@/lib/usageFilters";
import { browserLocal, fixedOffset, foldHeatmap, type HourCount } from "@/lib/usageHeatmap";

/** A `TrafficBucket` as the page hands it to a client component. */
export type ChartBucket = {
  start: number;
  counts: Record<StatusClass, number>;
  total: number;
  peakRpm: number;
};

// The four status tokens, per #60: 2xx = ink, 4xx = warn, 429 = info,
// 5xx = danger. CVD separation was validated there; do not restyle here.
const CLASS_COLOR: Record<StatusClass, string> = {
  "2xx": "var(--color-text)",
  "4xx": "var(--color-warn)",
  "429": "var(--color-info)",
  "5xx": "var(--color-danger)",
};

const CLASS_LABEL: Record<StatusClass, string> = {
  "2xx": "OK",
  "4xx": "Client error",
  "429": "Throttled",
  "5xx": "Server error",
};

const MONO = "var(--font-mono)";
const AXIS = { fontSize: 9, fill: "var(--color-muted)", fontFamily: MONO } as const;

/** The viewer's IANA zone once mounted; UTC during SSR and hydration. */
function useViewerTimeZone(): string {
  const [tz, setTz] = useState("UTC");
  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  return tz;
}

/**
 * The container's pixel width, so the SVG is laid out in CSS pixels rather
 * than scaled from a fixed viewBox — axis text stays 9px on a phone and on a
 * wide screen alike. 600 until measured (the server pass).
 */
function useWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(200, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** A bucket's axis label at the range's natural precision. */
function bucketLabel(startMs: number, range: Range, timeZone: string): string {
  const d = new Date(startMs);
  const time = d.toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  if (range === "1h" || range === "24h") return time;
  if (range === "7d") {
    const day = d.toLocaleDateString("en-US", { timeZone, weekday: "short" });
    return `${day} ${time}`;
  }
  return d.toLocaleDateString("en-GB", { timeZone, day: "numeric", month: "short" });
}

function Tip({ x, children }: { x: string; children: ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-0 z-10 rounded border border-border bg-panel-2 px-2 py-1 font-mono text-[11px] whitespace-nowrap shadow"
      style={{ left: x, transform: "translate(-50%, calc(-100% - 4px))" }}
    >
      {children}
    </div>
  );
}

function Swatch({ cls, dim }: { cls: StatusClass; dim?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-[2px]"
      style={{ background: dim ? "var(--color-border)" : CLASS_COLOR[cls] }}
    />
  );
}

/**
 * Stacked columns per bucket with a legend whose entries are toggles: press
 * one to emphasise that class and grey the rest; press it again (or another)
 * to move on. Emphasis is a view state, not a filter — the counts do not
 * change, so a tooltip still shows the whole bucket.
 */
export function TrafficChart({ data, range }: { data: ChartBucket[]; range: Range }) {
  const [emphasis, setEmphasis] = useState<StatusClass | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const tz = useViewerTimeZone();
  const ref = useRef<HTMLDivElement>(null);
  const W = useWidth(ref);

  const H = 160;
  const padL = 32;
  const padT = 8;
  const padB = 18;
  const plotH = H - padB;
  const nice = niceMax(Math.max(1, ...data.map((b) => b.total)));
  const slot = (W - padL) / data.length;
  const bw = Math.min(24, slot * 0.7);
  const y = (v: number) => padT + (plotH - padT) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const labelEvery = Math.ceil(data.length / 6);
  const label = (i: number) => bucketLabel(data[i].start, range, tz);

  return (
    <div>
      <div className="relative" ref={ref}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          role="img"
          aria-label="Requests per bucket, stacked by status class"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--color-border)" />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" {...AXIS}>
                {t >= 1000 ? `${t / 1000}k` : t}
              </text>
            </g>
          ))}
          {data.map((b, i) => {
            const x = padL + i * slot + (slot - bw) / 2;
            let acc = 0;
            return (
              <g key={b.start} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* Hit target: the whole slot, not just the bar. */}
                <rect x={padL + i * slot} y={0} width={slot} height={plotH} fill="transparent" />
                {STATUS_CLASSES.map((c) => {
                  const v = b.counts[c];
                  if (!v) return null;
                  const top = y(acc + v);
                  const h = Math.max(0, y(acc) - top - 2);
                  acc += v;
                  const dim = emphasis !== null && emphasis !== c;
                  return (
                    <rect
                      key={c}
                      x={x}
                      y={top}
                      width={bw}
                      height={h}
                      rx={2}
                      fill={dim ? "var(--color-border)" : CLASS_COLOR[c]}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  );
                })}
                {i % labelEvery === 0 ? (
                  <text x={x + bw / 2} y={H - 4} textAnchor="middle" {...AXIS}>
                    {label(i)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {hover !== null ? (
          <Tip x={`${((padL + hover * slot + slot / 2) / W) * 100}%`}>
            <div className="text-muted">{label(hover)}</div>
            <div>{data[hover].total.toLocaleString("en-US")} requests</div>
            {STATUS_CLASSES.filter((c) => data[hover].counts[c] > 0).map((c) => (
              <div key={c} className="flex items-center gap-1.5">
                <Swatch cls={c} />
                {c} · {data[hover].counts[c].toLocaleString("en-US")}
              </div>
            ))}
          </Tip>
        ) : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]" aria-label="Status classes">
        {STATUS_CLASSES.map((c) => {
          const dim = emphasis !== null && emphasis !== c;
          return (
            <li key={c}>
              <button
                type="button"
                aria-pressed={emphasis === c}
                onClick={() => setEmphasis((e) => (e === c ? null : c))}
                className={`flex cursor-pointer items-center gap-1.5 ${dim ? "text-muted" : "text-text"}`}
              >
                <Swatch cls={c} dim={dim} />
                {c} · {CLASS_LABEL[c]}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Peak requests-per-minute per bucket against the plan's ceiling: a solid
 * rule at the ceiling, the peak line over a ~10 % wash, and a point wherever
 * a bucket's peak reached the ceiling — those are the minutes that 429'd.
 */
export function RatePressure({
  data,
  range,
  ceiling,
}: {
  data: ChartBucket[];
  range: Range;
  /** The tier's sustained rate, `refillPerSecond × 60`. */
  ceiling: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const tz = useViewerTimeZone();
  const ref = useRef<HTMLDivElement>(null);
  const W = useWidth(ref);

  const H = 120;
  const padL = 32;
  // Room for the last point's marker (r 4 + a 2px ring).
  const padR = 6;
  const padB = 18;
  const plotH = H - padB;
  const max = Math.max(ceiling * 1.1, ...data.map((b) => b.peakRpm));
  const y = (v: number) => plotH - (v / max) * (plotH - 8);
  const x = (i: number) => padL + (i / Math.max(1, data.length - 1)) * (W - padL - padR);
  const slot = (W - padL - padR) / Math.max(1, data.length - 1);
  const line = data.map((b, i) => `${i ? "L" : "M"}${x(i)},${y(b.peakRpm)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${plotH} L${x(0)},${plotH} Z`;
  const over = (b: ChartBucket) => b.peakRpm >= ceiling;
  const anyOver = data.some(over);
  const label = (i: number) => bucketLabel(data[i].start, range, tz);

  return (
    <div className="relative" ref={ref}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block"
        role="img"
        aria-label="Peak requests per minute per bucket against the plan ceiling"
      >
        <line x1={padL} x2={W} y1={plotH} y2={plotH} stroke="var(--color-border)" />
        <line
          x1={padL}
          x2={W}
          y1={y(ceiling)}
          y2={y(ceiling)}
          stroke={anyOver ? "var(--color-danger)" : "var(--color-warn)"}
        />
        {/* Labelled at the left end: the line is usually quietest there. */}
        <text x={padL + 4} y={y(ceiling) - 4} {...AXIS}>
          plan ceiling {ceiling.toLocaleString("en-US")}/min
        </text>
        <path d={area} fill="var(--color-text)" opacity={0.08} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-text)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((b, i) => (
          <g key={b.start} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - slot / 2} y={0} width={slot} height={plotH} fill="transparent" />
            {hover === i || over(b) ? (
              <circle
                cx={x(i)}
                cy={y(b.peakRpm)}
                r={4}
                fill={over(b) ? "var(--color-danger)" : "var(--color-text)"}
                stroke="var(--color-panel)"
                strokeWidth={2}
              />
            ) : null}
          </g>
        ))}
        <text x={padL - 6} y={y(0) + 3} textAnchor="end" {...AXIS}>
          0
        </text>
        <text x={padL - 6} y={y(ceiling) + 3} textAnchor="end" {...AXIS}>
          {ceiling >= 1000 ? `${ceiling / 1000}k` : ceiling}
        </text>
      </svg>
      {hover !== null ? (
        <Tip x={`${(x(hover) / W) * 100}%`}>
          <div className="text-muted">{label(hover)}</div>
          <div>peak {data[hover].peakRpm.toLocaleString("en-US")} req/min</div>
        </Tip>
      ) : null}
    </div>
  );
}

/** The next 1 / 2 / 5 × 10ⁿ at or above `v`, for a top gridline that reads cleanly. */
function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

// ---------------------------------------------------------------------------
// When: the weekday × hour heatmap.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = [0, 6, 12, 18, 23];

/**
 * Requests by hour of day × weekday, folded here from the server's UTC hours
 * so the cells are the viewer's local hours. Sequential encoding: one hue
 * (ink), more is darker via opacity, with an empty cell drawn faintly so the
 * grid's shape is always visible. The server pass folds in UTC and the
 * browser re-folds in its own zone once mounted, the same way the axis labels
 * of the other charts localise.
 */
export function Heatmap({ rows, range }: { rows: HourCount[]; range: Range }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const W = useWidth(ref);

  const grid = foldHeatmap(rows, mounted ? browserLocal : fixedOffset(0));
  const max = Math.max(1, ...grid.flat());
  const gap = 2;
  const padL = 30;
  const padT = 14;
  const cell = Math.min(22, Math.max(8, (W - padL) / 24 - gap));
  const H = padT + 7 * (cell + gap);
  const cx = (h: number) => padL + h * (cell + gap);
  const cy = (d: number) => padT + d * (cell + gap);

  return (
    <div>
      <div className="relative" ref={ref}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          role="img"
          aria-label="Requests by hour of day and weekday"
        >
          {HOUR_LABELS.map((h) => (
            <text key={h} x={cx(h) + cell / 2} y={9} textAnchor="middle" {...AXIS}>
              {String(h).padStart(2, "0")}
            </text>
          ))}
          {grid.map((row, d) => (
            <g key={d}>
              <text x={padL - 6} y={cy(d) + cell / 2 + 3} textAnchor="end" {...AXIS}>
                {DAYS[d]}
              </text>
              {row.map((v, h) => (
                <rect
                  key={h}
                  x={cx(h)}
                  y={cy(d)}
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
        {hover ? (
          <Tip x={`${((cx(hover[1]) + cell / 2) / W) * 100}%`}>
            <div className="text-muted">
              {DAYS[hover[0]]} {String(hover[1]).padStart(2, "0")}:00
            </div>
            <div>{grid[hover[0]][hover[1]].toLocaleString("en-US")} requests</div>
          </Tip>
        ) : null}
      </div>
      {range === "1h" || range === "24h" ? (
        <p className="mt-3 font-mono text-[11px] text-muted">
          A {range} range fills only a sliver of the week — 7d and 30d fill the grid.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What: the per-document sparkline.

/** One thin muted line over the range's buckets; no axes, no hover — the row's figures carry the numbers. */
export function Sparkline({
  values,
  width = 72,
  height = 18,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={width} height={height} className="block shrink-0" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
