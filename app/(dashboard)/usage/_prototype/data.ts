/*
 * PROTOTYPE ONLY — dummy access-log data, generated in memory from a seeded
 * PRNG so every reload shows the same story. Mirrors the AccessLog columns
 * plus the derived Handle. Aggregations live here so all three variants read
 * the same numbers.
 *
 * Three planted stories, so the warnings and charts have something to say:
 *  1. prices.json (private) is being probed right now — refused reads.
 *  2. products.json (public) took a read burst 3h ago that tripped 429s.
 *  3. ci-runner pushed a bad deploy 2 days ago — 500s on PUT staging.json.
 */

export type Range = "1h" | "24h" | "7d" | "30d";
export type Credential = "api_key" | "session" | "none";
export type CredFilter = "all" | Credential;

export type Entry = {
  at: number; // ms
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  route: string;
  path: string;
  status: number;
  durationMs: number;
  credential: Credential;
  /** "you" | "acct-xxxx" | null (anonymous) */
  actor: string | null;
  apiKey: string | null;
  documentId: string | null;
  workspaceId: string | null;
};

export const NOW = Date.UTC(2026, 8, 14, 11, 0, 0);
export const RANGE_MS: Record<Range, number> = {
  "1h": 3600e3,
  "24h": 86400e3,
  "7d": 7 * 86400e3,
  "30d": 30 * 86400e3,
};
const BUCKET_MS: Record<Range, number> = {
  "1h": 5 * 60e3,
  "24h": 3600e3,
  "7d": 6 * 3600e3,
  "30d": 86400e3,
};

export const PLAN = {
  name: "Pro",
  perMinute: 600,
  quotas: {
    workspaces: { used: 8, cap: 10 },
    documents: { used: 61_240, cap: 100_000 },
    apiKeys: { used: 3, cap: 10 },
  },
};

export const WORKSPACES = [
  { id: "ws-catalog", name: "catalog" },
  { id: "ws-config", name: "app-config" },
  { id: "ws-feature-flags", name: "feature-flags" },
  { id: "ws-cms", name: "cms-content" },
];
export const DOCUMENTS = [
  { id: "a1b2c3d4e5f6g7h8", ws: "ws-catalog", name: "products.json", isPublic: true },
  { id: "h8g7f6e5d4c3b2a1", ws: "ws-catalog", name: "prices.json", isPublic: false },
  { id: "q1w2e3r4t5y6u7i8", ws: "ws-config", name: "prod.json", isPublic: false },
  { id: "z9x8c7v6b5n4m3l2", ws: "ws-config", name: "staging.json", isPublic: false },
  { id: "p0o9i8u7y6t5r4e3", ws: "ws-feature-flags", name: "flags.json", isPublic: true },
  { id: "l1k2j3h4g5f6d7s8", ws: "ws-cms", name: "homepage.json", isPublic: true },
  { id: "m9n8b7v6c5x4z3a2", ws: "ws-cms", name: "drafts.json", isPublic: false },
];
export const API_KEYS = ["prod-api", "staging", "ci-runner"];
const HANDLES = ["acct-7f3a", "acct-c210", "acct-91be", "acct-04dd", "acct-e5a7"];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

let cache: Entry[] | null = null;
export function entries(): Entry[] {
  if (cache) return cache;
  const r = mulberry32(20260914);
  const out: Entry[] = [];
  const start = NOW - RANGE_MS["30d"];
  // Baseline traffic: diurnal, busier on weekdays.
  for (let t = start; t < NOW; t += 60e3) {
    const d = new Date(t);
    const hour = d.getUTCHours();
    const dow = d.getUTCDay();
    const diurnal =
      0.35 + 0.65 * Math.max(0, Math.sin(((hour - 5) / 24) * Math.PI));
    const weekday = dow === 0 || dow === 6 ? 0.45 : 1;
    const lambda = 1.6 * diurnal * weekday;
    let n = 0;
    for (let p = Math.exp(-lambda), k = r(); k > p; n++) k *= r();
    for (let i = 0; i < n; i++) out.push(baseline(r, t + r() * 60e3));
  }
  // Story 1: probing prices.json (private) for the last 50 minutes.
  for (let i = 0; i < 212; i++) {
    const at = NOW - 50 * 60e3 + r() * 50 * 60e3;
    const anon = r() < 0.7;
    out.push({
      at,
      method: "GET",
      route: "/api/documents/[id]",
      path: "/api/documents/h8g7f6e5d4c3b2a1",
      status: r() < 0.9 ? 401 : 404,
      durationMs: 4 + Math.floor(r() * 6),
      credential: anon ? "none" : "api_key",
      actor: anon ? null : "acct-04dd",
      apiKey: null,
      documentId: "h8g7f6e5d4c3b2a1",
      workspaceId: "ws-catalog",
    });
  }
  // Story 2: public-read burst on products.json 3h ago that tripped 429s.
  for (let i = 0; i < 420; i++) {
    const at = NOW - 3 * 3600e3 + r() * 12 * 60e3;
    out.push({
      at,
      method: "GET",
      route: "/api/documents/[id]",
      path: "/api/documents/a1b2c3d4e5f6g7h8",
      status: i > 260 && r() < 0.6 ? 429 : 200,
      durationMs: 6 + Math.floor(r() * 10),
      credential: "none",
      actor: null,
      apiKey: null,
      documentId: "a1b2c3d4e5f6g7h8",
      workspaceId: "ws-catalog",
    });
  }
  // Story 3: ci-runner bad deploy 2 days ago — 500s on PUT staging.json.
  for (let i = 0; i < 60; i++) {
    const at = NOW - 2 * 86400e3 + r() * 40 * 60e3;
    out.push({
      at,
      method: "PUT",
      route: "/api/documents/[id]",
      path: "/api/documents/z9x8c7v6b5n4m3l2",
      status: r() < 0.7 ? 500 : 200,
      durationMs: 180 + Math.floor(r() * 400),
      credential: "api_key",
      actor: "you",
      apiKey: "ci-runner",
      documentId: "z9x8c7v6b5n4m3l2",
      workspaceId: "ws-config",
    });
  }
  out.sort((a, b) => a.at - b.at);
  cache = out;
  return out;
}

function baseline(r: () => number, at: number): Entry {
  const k = r();
  const doc = pick(r, DOCUMENTS);
  const ws = WORKSPACES.find((w) => w.id === doc.ws)!;
  const dur = () => Math.round(8 + Math.pow(r(), 3) * 300);
  if (k < 0.55) {
    const anon = doc.isPublic && r() < 0.5;
    const other = !anon && doc.isPublic && r() < 0.25;
    return {
      at,
      method: "GET",
      route: "/api/documents/[id]",
      path: `/api/documents/${doc.id}`,
      status: r() < 0.985 ? 200 : 404,
      durationMs: dur(),
      credential: anon ? "none" : other ? "api_key" : r() < 0.85 ? "api_key" : "session",
      actor: anon ? null : other ? pick(r, HANDLES) : "you",
      apiKey: anon || other ? null : pick(r, API_KEYS),
      documentId: doc.id,
      workspaceId: ws.id,
    };
  }
  if (k < 0.75) {
    return {
      at,
      method: r() < 0.6 ? "PATCH" : "PUT",
      route: "/api/documents/[id]",
      path: `/api/documents/${doc.id}`,
      status: r() < 0.96 ? 200 : r() < 0.7 ? 422 : 400,
      durationMs: dur() + 20,
      credential: "api_key",
      actor: "you",
      apiKey: pick(r, API_KEYS),
      documentId: doc.id,
      workspaceId: ws.id,
    };
  }
  if (k < 0.85) {
    const session = r() < 0.5;
    return {
      at,
      method: "GET",
      route: "/api/documents",
      path: "/api/documents",
      status: 200,
      durationMs: dur() + 15,
      credential: session ? "session" : "api_key",
      actor: "you",
      apiKey: session ? null : pick(r, API_KEYS),
      documentId: null,
      workspaceId: null,
    };
  }
  if (k < 0.92) {
    return {
      at,
      method: "GET",
      route: "/api/documents/[id]/versions",
      path: `/api/documents/${doc.id}/versions`,
      status: 200,
      durationMs: dur() + 10,
      credential: "session",
      actor: "you",
      apiKey: null,
      documentId: doc.id,
      workspaceId: ws.id,
    };
  }
  if (k < 0.97) {
    return {
      at,
      method: "POST",
      route: "/api/documents",
      path: "/api/documents",
      status: r() < 0.9 ? 201 : 422,
      durationMs: dur() + 30,
      credential: "api_key",
      actor: "you",
      apiKey: pick(r, API_KEYS),
      documentId: null,
      workspaceId: ws.id,
    };
  }
  return {
    at,
    method: "GET",
    route: "/api/workspaces/[id]",
    path: `/api/workspaces/${ws.id}`,
    status: 200,
    durationMs: dur(),
    credential: "session",
    actor: "you",
    apiKey: null,
    documentId: null,
    workspaceId: ws.id,
  };
}

// ---- Filters -------------------------------------------------------------

export type Filters = { range: Range; cred: CredFilter; resource: string | null };

export function filtered(f: Filters): Entry[] {
  const since = NOW - RANGE_MS[f.range];
  return entries().filter(
    (e) =>
      e.at >= since &&
      (f.cred === "all" || e.credential === f.cred) &&
      (!f.resource || e.documentId === f.resource || e.workspaceId === f.resource),
  );
}

// ---- Aggregations --------------------------------------------------------

export type StatusClass = "2xx" | "4xx" | "429" | "5xx";
export function statusClass(s: number): StatusClass {
  if (s === 429) return "429";
  if (s >= 500) return "5xx";
  if (s >= 400) return "4xx";
  return "2xx";
}
export const CLASSES: StatusClass[] = ["2xx", "4xx", "429", "5xx"];

export type Bucket = {
  t: number;
  counts: Record<StatusClass, number>;
  total: number;
  p95: number;
  peakRpm: number;
};

/** Time buckets: 5-min for 1h, hourly for 24h, 6-hourly for 7d, daily for 30d. */
export function buckets(es: Entry[], range: Range): Bucket[] {
  const width = BUCKET_MS[range];
  const since = NOW - RANGE_MS[range];
  const n = Math.ceil(RANGE_MS[range] / width);
  const out: Bucket[] = Array.from({ length: n }, (_, i) => ({
    t: since + i * width,
    counts: { "2xx": 0, "4xx": 0, "429": 0, "5xx": 0 },
    total: 0,
    p95: 0,
    peakRpm: 0,
  }));
  const durs: number[][] = out.map(() => []);
  const mins: Map<number, number>[] = out.map(() => new Map());
  for (const e of es) {
    const i = Math.min(n - 1, Math.floor((e.at - since) / width));
    out[i].counts[statusClass(e.status)]++;
    out[i].total++;
    durs[i].push(e.durationMs);
    const m = Math.floor(e.at / 60e3);
    mins[i].set(m, (mins[i].get(m) ?? 0) + 1);
  }
  out.forEach((b, i) => {
    b.p95 = percentile(durs[i], 0.95);
    b.peakRpm = Math.max(0, ...mins[i].values());
  });
  return out;
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export function countBy<K extends string>(es: Entry[], key: (e: Entry) => K | null) {
  const m = new Map<K, Entry[]>();
  for (const e of es) {
    const k = key(e);
    if (k == null) continue;
    let arr = m.get(k);
    if (!arr) {
      arr = [];
      m.set(k, arr);
    }
    arr.push(e);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}

export function isRefused(e: Entry) {
  return e.status === 401 || e.status === 403 || e.status === 404;
}

/** Warnings: probed resources (>=20 refused in trailing hour) and throttled. */
export const PROBE_THRESHOLD = 20;
export function warnings() {
  const hour = entries().filter((e) => e.at >= NOW - 3600e3);
  const probed = countBy(hour.filter(isRefused), (e) => e.documentId ?? e.workspaceId)
    .filter(([, es]) => es.length >= PROBE_THRESHOLD)
    .map(([id, es]) => ({
      id,
      refused: es.length,
      actors: new Set(es.map((e) => e.actor ?? "anon")).size,
    }));
  const throttled = entries().filter(
    (e) => e.at >= NOW - 4 * 3600e3 && e.status === 429,
  ).length;
  return { probed, throttled };
}

/** Hour-of-day × day-of-week grid of request counts (the heatmap). */
export function heat(es: Entry[]): number[][] {
  const g = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const e of es) {
    const d = new Date(e.at);
    g[d.getUTCDay()][d.getUTCHours()]++;
  }
  return g;
}

/** Latency histogram in log-ish bins. */
export const LAT_BINS = [0, 10, 25, 50, 100, 250, 500];
export function latencyHist(es: Entry[]): number[] {
  const h = Array(LAT_BINS.length).fill(0) as number[];
  for (const e of es) {
    let i = LAT_BINS.findIndex((_, j) => e.durationMs < (LAT_BINS[j + 1] ?? Infinity));
    if (i < 0) i = LAT_BINS.length - 1;
    h[i]++;
  }
  return h;
}

export function resourceName(id: string | null): string {
  if (!id) return "—";
  return (
    DOCUMENTS.find((d) => d.id === id)?.name ??
    WORKSPACES.find((w) => w.id === id)?.name ??
    id
  );
}

export function fmtTime(ms: number, range: Range): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  if (range === "1h" || range === "24h") return `${hh}:${mm}`;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return range === "7d" ? `${day} ${hh}:00` : `${d.getUTCDate()} Sep`;
}
export function ago(ms: number): string {
  const s = Math.round((NOW - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export function compact(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString("en-US");
}
export function pct(a: number, b: number): string {
  return b === 0 ? "0%" : `${((100 * a) / b).toFixed(a / b < 0.1 ? 1 : 0)}%`;
}
