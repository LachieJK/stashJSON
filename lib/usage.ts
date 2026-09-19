import { Prisma, type User } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { handleFor } from "@/lib/handles";
import { PLANS, QUOTA_RESOURCES, type QuotaResource } from "@/lib/plans";
import { countOwned } from "@/lib/quotas";
import type { StatusClass } from "@/lib/statusClass";
import type { Range, UsageFilters } from "@/lib/usageFilters";

/**
 * Everything the Usage page reads, server-side only (decision in #60: no
 * public usage API — the aggregates live here and are called from the page).
 * The resource picker and plan headroom need no log; the traffic buckets,
 * hero summary and warnings (#62), the hourly counts behind the heatmap and
 * the per-resource rows (#63), and the actors and paginated entries (#64)
 * are access-log aggregates. The URL filters (`lib/usageFilters.ts`), the status-class vocabulary
 * (`lib/statusClass.ts`) and the heatmap fold (`lib/usageHeatmap.ts`) are
 * kept free of `lib/db` so client components can import them.
 */

// ---------------------------------------------------------------------------
// Resource picker options.

export type ResourceOptions = {
  workspaces: { id: string; name: string }[];
  /** `workspaceId` null = detached. Capped at `RESOURCE_PICKER_LIMIT`, newest first. */
  documents: { id: string; workspaceId: string | null }[];
};

/**
 * A `<select>` with every document of a 100,000-document account is not a
 * control, so the picker shows the most recently updated ones. A deep link
 * (`?resource=<id>` from a workspace page) still works for any id.
 */
export const RESOURCE_PICKER_LIMIT = 200;

export async function loadResourceOptions(userId: string): Promise<ResourceOptions> {
  const [workspaces, documents] = await Promise.all([
    prisma.workspace.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.document.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: RESOURCE_PICKER_LIMIT,
      select: { id: true, workspaceId: true },
    }),
  ]);
  return { workspaces, documents };
}

// ---------------------------------------------------------------------------
// Plan headroom.

export type QuotaUsage = {
  resource: QuotaResource;
  used: number;
  /** null = unlimited. */
  cap: number | null;
};

/**
 * `used / cap` for each quota, with `used` counted the same way
 * `assertWithinQuota` counts it — the meter and the refusal agree by
 * construction.
 */
export async function loadPlanUsage(
  user: Pick<User, "id" | "tier">,
): Promise<QuotaUsage[]> {
  const quotas = PLANS[user.tier].quotas;
  return Promise.all(
    QUOTA_RESOURCES.map(async (resource) => ({
      resource,
      used: await countOwned(user.id, resource),
      cap: quotas[resource],
    })),
  );
}

// ---------------------------------------------------------------------------
// Traffic: the bucket grid.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How far back each range reaches. 30d is the log's retention ceiling. */
const RANGE_MS: Record<Range, number> = {
  "1h": HOUR_MS,
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

/** Bucket width per range — chosen so each divides its range exactly. */
const BUCKET_MS: Record<Range, number> = {
  "1h": 5 * MINUTE_MS,
  "24h": HOUR_MS,
  "7d": 6 * HOUR_MS,
  "30d": DAY_MS,
};

/** The same widths as the page says them ("requests per 6 hours"). */
export const BUCKET_LABEL: Record<Range, string> = {
  "1h": "5 minutes",
  "24h": "hour",
  "7d": "6 hours",
  "30d": "day",
};

export type BucketGrid = {
  /** Inclusive start of bucket 0: exactly one range before `now`. */
  start: Date;
  widthMs: number;
  /** Number of buckets; the last one ends at `now`. */
  count: number;
};

/**
 * The grid a range resolves to: anchored at `now - range` rather than a
 * clock boundary so the last bucket always ends at now and an entry at the
 * exact range start lands in bucket 0.
 */
export function bucketGrid(range: Range, now: Date = new Date()): BucketGrid {
  const widthMs = BUCKET_MS[range];
  return {
    start: new Date(now.getTime() - RANGE_MS[range]),
    widthMs,
    count: RANGE_MS[range] / widthMs,
  };
}

// ---------------------------------------------------------------------------
// Traffic buckets.

/** The page's three URL controls plus the owner whose view this is. */
export type TrafficQuery = UsageFilters & { userId: string };

export type TrafficBucket = {
  start: Date;
  counts: Record<StatusClass, number>;
  total: number;
  /** The busiest single minute inside the bucket, in requests. */
  peakRpm: number;
};

/**
 * The `WHERE` every page aggregate shares: the owner's view of the log (rows
 * whose `owner_user_id` is the viewer — a public read of their document by a
 * stranger is theirs), narrowed by the credential and resource filters. The
 * resource filter matches a document id or a workspace id, so one control
 * covers both kinds.
 */
function scopeSql(q: Pick<TrafficQuery, "userId" | "cred" | "resource">): Prisma.Sql {
  return Prisma.sql`
    owner_user_id = ${q.userId}
    ${q.cred === "all" ? Prisma.empty : Prisma.sql`AND credential = ${q.cred}::"Credential"`}
    ${
      q.resource === null
        ? Prisma.empty
        : Prisma.sql`AND (document_id = ${q.resource} OR workspace_id = ${q.resource})`
    }`;
}

/** `scopeSql` narrowed to the range: `[grid.start, now)`, half-open so `now` itself is out. */
function rangeSql(q: TrafficQuery, grid: BucketGrid, now: Date): Prisma.Sql {
  return Prisma.sql`
    ${scopeSql(q)}
    AND at >= ${grid.start}::timestamptz
    AND at < ${now}::timestamptz`;
}

/**
 * The bucket an `at` falls in: `date_bin` with the range start as origin, so
 * an entry at the exact start is in bucket 0 and every query that buckets
 * lands on the same grid by construction.
 */
function bucketSql(grid: BucketGrid): Prisma.Sql {
  return Prisma.sql`date_bin(make_interval(secs => ${grid.widthMs / 1000}), at, ${grid.start}::timestamptz)`;
}

type BucketRow = {
  bucket: Date;
  ok: number;
  client_error: number;
  throttled: number;
  server_error: number;
  peak_rpm: number;
};

/**
 * One row per bucket of the range, in order, with empty buckets present as
 * zeros. A single statement: `date_bin` folds rows onto the grid (origin =
 * the range start, so an entry at the exact start is in bucket 0) and, one
 * level down, onto minutes, so the peak minute inside each bucket comes from
 * the same pass as the class counts.
 */
export async function trafficBuckets(
  q: TrafficQuery,
  now: Date = new Date(),
): Promise<TrafficBucket[]> {
  const grid = bucketGrid(q.range, now);
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT bucket,
           sum(ok)::int           AS ok,
           sum(client_error)::int AS client_error,
           sum(throttled)::int    AS throttled,
           sum(server_error)::int AS server_error,
           max(n)::int            AS peak_rpm
    FROM (
      SELECT ${bucketSql(grid)} AS bucket,
             date_bin('1 minute', at, ${grid.start}::timestamptz) AS minute,
             count(*) FILTER (WHERE status < 400)                                        AS ok,
             count(*) FILTER (WHERE status >= 400 AND status < 500 AND status <> 429)    AS client_error,
             count(*) FILTER (WHERE status = 429)                                        AS throttled,
             count(*) FILTER (WHERE status >= 500)                                       AS server_error,
             count(*)                                                                    AS n
      FROM access_logs
      WHERE ${rangeSql(q, grid, now)}
      GROUP BY 1, 2
    ) minutes
    GROUP BY bucket
    ORDER BY bucket`;

  const byStart = new Map(rows.map((r) => [r.bucket.getTime(), r]));
  return Array.from({ length: grid.count }, (_, i) => {
    const start = new Date(grid.start.getTime() + i * grid.widthMs);
    const r = byStart.get(start.getTime());
    const counts: Record<StatusClass, number> = {
      "2xx": r?.ok ?? 0,
      "4xx": r?.client_error ?? 0,
      "429": r?.throttled ?? 0,
      "5xx": r?.server_error ?? 0,
    };
    return {
      start,
      counts,
      total: counts["2xx"] + counts["4xx"] + counts["429"] + counts["5xx"],
      peakRpm: r?.peak_rpm ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Hero summary.

export type TrafficSummary = {
  /** Requests in the range. */
  total: number;
  /** 4xx + 5xx. A 429 is throttling, not an error, and is counted apart. */
  errors: number;
  throttled: number;
  /** Requests in the trailing hour, whatever the range — the hero's req/min. */
  lastHour: number;
};

/** The hero's figures, under the same filters as the buckets, in one statement. */
export async function summary(
  q: TrafficQuery,
  now: Date = new Date(),
): Promise<TrafficSummary> {
  const grid = bucketGrid(q.range, now);
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  const [row] = await prisma.$queryRaw<TrafficSummary[]>`
    SELECT count(*)::int                                                   AS total,
           count(*) FILTER (WHERE status >= 400 AND status <> 429)::int   AS errors,
           count(*) FILTER (WHERE status = 429)::int                       AS throttled,
           count(*) FILTER (WHERE at >= ${hourAgo}::timestamptz)::int     AS "lastHour"
    FROM access_logs
    WHERE ${rangeSql(q, grid, now)}`;
  return row;
}

// ---------------------------------------------------------------------------
// Warnings — the two fixed rules from #60, stated in the UI.

/**
 * A resource is *probed* once it has refused this many requests in the
 * trailing hour. The one place the number lives; the sentence on the page
 * quotes it.
 */
export const PROBE_THRESHOLD = 20;

/** A *refused* request: the three statuses the probed rule counts. */
const REFUSED_STATUSES = [401, 403, 404];
const refusedSql = Prisma.sql`status IN (${Prisma.join(REFUSED_STATUSES)})`;

/** The window both warnings look at, regardless of the page's range. */
export const WARNING_WINDOW_MS = HOUR_MS;

export type ProbedResource = {
  /** The document id, or the workspace id when the request named no document. */
  resourceId: string;
  refused: number;
  /** Accounts seen, with all anonymous callers counted as one source. */
  distinctActors: number;
};

export type Warnings = {
  probed: ProbedResource[];
  /** 429s billed to this account in the trailing hour. */
  throttled: number;
};

/**
 * Both warnings, computed for the owner from the trailing hour and nothing
 * else: the page's range, credential and resource filters do not apply, so
 * a warning cannot be filtered out of sight. Never stored, never names an
 * actor (the count of sources is as far as it goes).
 *
 * Throttled is "any 429 on the account's `:api` bucket", and every 429 the
 * log attributes to the owner is one: resource routes meter `:api` whatever
 * the credential (a dashboard cookie included), a public read by a stranger
 * bills the owner's bucket and is logged with the owner — exactly the case
 * the rule is for — and the `:dashboard` bucket's 429s (key/account routes)
 * are thrown before an owner is recorded, so they never appear here. No
 * credential predicate, then; filtering out `session` would drop real `:api`
 * throttling.
 */
export async function warnings(userId: string, now: Date = new Date()): Promise<Warnings> {
  const since = new Date(now.getTime() - WARNING_WINDOW_MS);
  const [probed, [{ throttled }]] = await Promise.all([
    prisma.$queryRaw<ProbedResource[]>`
      SELECT coalesce(document_id, workspace_id) AS "resourceId",
             count(*)::int                       AS refused,
             (count(DISTINCT actor_user_id)
              + (count(*) FILTER (WHERE actor_user_id IS NULL) > 0)::int)::int AS "distinctActors"
      FROM access_logs
      WHERE owner_user_id = ${userId}
        AND at >= ${since}::timestamptz
        AND at < ${now}::timestamptz
        AND ${refusedSql}
        AND coalesce(document_id, workspace_id) IS NOT NULL
      GROUP BY 1
      HAVING count(*) >= ${PROBE_THRESHOLD}
      ORDER BY refused DESC, 1`,
    prisma.$queryRaw<{ throttled: number }[]>`
      SELECT count(*)::int AS throttled
      FROM access_logs
      WHERE owner_user_id = ${userId}
        AND at >= ${since}::timestamptz
        AND at < ${now}::timestamptz
        AND status = 429`,
  ]);
  return { probed, throttled };
}

// ---------------------------------------------------------------------------
// When: hourly counts for the heatmap.

export type HourlyCount = {
  /** The start of the UTC hour. */
  hourUtc: Date;
  count: number;
};

/**
 * Requests per UTC hour over the range, non-empty hours only, oldest first —
 * at most 720 rows at 30d. The weekday × hour fold happens on the client
 * (`foldHeatmap`), which is the only place the viewer's zone is known.
 * `date_bin` from the epoch rather than `date_trunc('hour', …)`: the latter
 * truncates in the session's zone, which is only a UTC hour when that zone
 * is a whole-hour one.
 */
export async function hourlyCounts(
  q: TrafficQuery,
  now: Date = new Date(),
): Promise<HourlyCount[]> {
  const grid = bucketGrid(q.range, now);
  return prisma.$queryRaw<HourlyCount[]>`
    SELECT date_bin('1 hour', at, '1970-01-01T00:00:00Z'::timestamptz) AS "hourUtc",
           count(*)::int                                              AS count
    FROM access_logs
    WHERE ${rangeSql(q, grid, now)}
    GROUP BY 1
    ORDER BY 1`;
}

// ---------------------------------------------------------------------------
// What: per-resource rows.

export type DocumentUsage = {
  id: string;
  /** false when the document has been deleted — the log keeps the id (ADR-0002). */
  exists: boolean;
  /** null when the document no longer exists. */
  isPublic: boolean | null;
  probed: boolean;
  total: number;
  refused: number;
  /** Requests per bucket of the range, for the sparkline. */
  series: number[];
};

export type WorkspaceUsage = {
  /** null for the trailing group of documents outside any workspace. */
  id: string | null;
  /** null when the workspace no longer exists (or `id` is null). */
  name: string | null;
  exists: boolean;
  /** Every request the log attributes to the workspace, document-level or not. */
  total: number;
  refused: number;
  probed: boolean;
  documents: DocumentUsage[];
};

/**
 * The What section lists the busiest documents, not every document: past
 * this many the list is no longer read, and a 100,000-document account
 * would otherwise cost a series per document. Workspace totals are never
 * capped, so the group figure stays right.
 */
export const RESOURCE_ROW_LIMIT = 200;

type WorkspaceTotals = { workspaceId: string | null; total: number; refused: number };
type DocumentTotals = WorkspaceTotals & { documentId: string };
type SeriesRow = { documentId: string; bucket: Date; count: number };

/**
 * Workspaces with their documents beneath, busiest first, under the page's
 * filters. Grouping follows the log's own snapshot of `workspace_id`, so a
 * document that has since moved or been deleted appears where the requests
 * hit it. `probed` reuses the page's warnings (trailing hour, unfiltered), so
 * a resource never loses its badge to the range control.
 */
export async function resourceRows(
  q: TrafficQuery,
  warn: Warnings,
  now: Date = new Date(),
): Promise<WorkspaceUsage[]> {
  const grid = bucketGrid(q.range, now);
  const inRange = rangeSql(q, grid, now);

  const [workspaces, documents] = await Promise.all([
    prisma.$queryRaw<WorkspaceTotals[]>`
      SELECT workspace_id                               AS "workspaceId",
             count(*)::int                              AS total,
             count(*) FILTER (WHERE ${refusedSql})::int AS refused
      FROM access_logs
      WHERE ${inRange}
      GROUP BY 1`,
    prisma.$queryRaw<DocumentTotals[]>`
      SELECT workspace_id                               AS "workspaceId",
             document_id                                AS "documentId",
             count(*)::int                              AS total,
             count(*) FILTER (WHERE ${refusedSql})::int AS refused
      FROM access_logs
      WHERE ${inRange} AND document_id IS NOT NULL
      GROUP BY 1, 2
      ORDER BY total DESC, 2
      LIMIT ${RESOURCE_ROW_LIMIT}`,
  ]);

  const documentIds = documents.map((d) => d.documentId);
  const workspaceIds = workspaces.flatMap((w) => (w.workspaceId ? [w.workspaceId] : []));
  const [series, known, names] = await Promise.all([
    documentIds.length === 0
      ? []
      : prisma.$queryRaw<SeriesRow[]>`
          SELECT document_id     AS "documentId",
                 ${bucketSql(grid)} AS bucket,
                 count(*)::int    AS count
          FROM access_logs
          WHERE ${inRange} AND document_id IN (${Prisma.join(documentIds)})
          GROUP BY 1, 2`,
    prisma.document.findMany({
      where: { id: { in: documentIds }, userId: q.userId },
      select: { id: true, isPublic: true },
    }),
    prisma.workspace.findMany({
      where: { id: { in: workspaceIds }, userId: q.userId },
      select: { id: true, name: true },
    }),
  ]);

  const seriesByDoc = new Map<string, number[]>();
  for (const r of series) {
    const s = seriesByDoc.get(r.documentId) ?? Array<number>(grid.count).fill(0);
    s[Math.floor((r.bucket.getTime() - grid.start.getTime()) / grid.widthMs)] = r.count;
    seriesByDoc.set(r.documentId, s);
  }
  const publicById = new Map(known.map((d) => [d.id, d.isPublic]));
  const nameById = new Map(names.map((w) => [w.id, w.name]));
  const probed = new Set(warn.probed.map((p) => p.resourceId));

  const rows = workspaces.map<WorkspaceUsage>((w) => ({
    id: w.workspaceId,
    name: w.workspaceId === null ? null : (nameById.get(w.workspaceId) ?? null),
    exists: w.workspaceId !== null && nameById.has(w.workspaceId),
    total: w.total,
    refused: w.refused,
    probed: w.workspaceId !== null && probed.has(w.workspaceId),
    documents: documents
      .filter((d) => d.workspaceId === w.workspaceId)
      .map((d) => ({
        id: d.documentId,
        exists: publicById.has(d.documentId),
        isPublic: publicById.get(d.documentId) ?? null,
        probed: probed.has(d.documentId),
        total: d.total,
        refused: d.refused,
        series: seriesByDoc.get(d.documentId) ?? Array<number>(grid.count).fill(0),
      })),
  }));
  // Busiest first; the "no workspace" group closes the list whatever its size.
  return rows.sort((a, b) => {
    if ((a.id === null) !== (b.id === null)) return a.id === null ? 1 : -1;
    return b.total - a.total || (a.id ?? "").localeCompare(b.id ?? "");
  });
}

// ---------------------------------------------------------------------------
// Who: actors.

export type ActorTotals = {
  /** Requests the owner made themselves, by key or from the dashboard. */
  you: number;
  /** Requests by other signed-in accounts (shown as handles). */
  others: number;
  /** Requests that resolved no identity. */
  anonymous: number;
};

export type KeyActorRow = {
  /** The API key's name, or "dashboard" for session requests. */
  label: string;
  /** A revoked key keeps its name for its historical rows. */
  revoked: boolean;
  total: number;
  refused: number;
  lastSeen: Date;
};

export type HandleActorRow = {
  /** A per-owner pseudonym (`acct-7f3a`), never an account id. */
  handle: string;
  total: number;
  refused: number;
  lastSeen: Date;
};

export type Actors = {
  totals: ActorTotals;
  /** Your own requests, one row per key (busiest first). */
  keys: KeyActorRow[];
  /** Other accounts, one row per handle (busiest first), capped at `ACTOR_ROW_LIMIT`. */
  handles: HandleActorRow[];
};

/** Handle rows shown; the totals above them count every account regardless. */
export const ACTOR_ROW_LIMIT = 100;

type Credential = "api_key" | "session" | "none";

type ActorRow = {
  actorUserId: string | null;
  apiKeyId: string | null;
  credential: Credential;
  total: number;
  refused: number;
  lastSeen: Date;
};

/**
 * Who touched the owner's resources over the range: the three-way split and
 * the rows beneath it. One statement groups the log by (actor, key); the
 * split and the rows are read off it here. Another account's id is mapped
 * through `handleFor` before it leaves this function — the page props carry
 * handles only, so a cross-user disclosure cannot happen in rendering.
 */
export async function actors(q: TrafficQuery, now: Date = new Date()): Promise<Actors> {
  const grid = bucketGrid(q.range, now);
  const rows = await prisma.$queryRaw<ActorRow[]>`
    SELECT actor_user_id                              AS "actorUserId",
           api_key_id                                 AS "apiKeyId",
           credential,
           count(*)::int                              AS total,
           count(*) FILTER (WHERE ${refusedSql})::int AS refused,
           max(at)                                    AS "lastSeen"
    FROM access_logs
    WHERE ${rangeSql(q, grid, now)}
    GROUP BY 1, 2, 3
    ORDER BY total DESC, "lastSeen" DESC`;

  const totals: ActorTotals = { you: 0, others: 0, anonymous: 0 };
  const ownRows: ActorRow[] = [];
  const byOther = new Map<string, HandleActorRow>();
  for (const r of rows) {
    if (r.actorUserId === null) {
      totals.anonymous += r.total;
    } else if (r.actorUserId === q.userId) {
      totals.you += r.total;
      ownRows.push(r);
    } else {
      totals.others += r.total;
      // One handle per account: an account may have arrived by several keys.
      const handle = handleFor(q.userId, r.actorUserId);
      const row = byOther.get(handle);
      if (row) {
        row.total += r.total;
        row.refused += r.refused;
        if (r.lastSeen > row.lastSeen) row.lastSeen = r.lastSeen;
      } else {
        byOther.set(handle, { handle, total: r.total, refused: r.refused, lastSeen: r.lastSeen });
      }
    }
  }

  const names = await keyNames(q.userId, ownRows.map((r) => r.apiKeyId));
  const keys = ownRows.map<KeyActorRow>((r) => ({
    ...ownLabel(r, names),
    total: r.total,
    refused: r.refused,
    lastSeen: r.lastSeen,
  }));
  const handles = [...byOther.values()]
    .sort((a, b) => b.total - a.total || b.lastSeen.getTime() - a.lastSeen.getTime())
    .slice(0, ACTOR_ROW_LIMIT);
  return { totals, keys, handles };
}

type KeyName = { name: string; revokedAt: Date | null };

/**
 * Names for the viewer's keys by id, revoked ones included — a key's rows
 * outlive the key, and "old-ci" says more than a uuid. Scoped to the viewer
 * in the query, so another account's key is never named whatever is passed.
 */
async function keyNames(userId: string, ids: (string | null)[]): Promise<Map<string, KeyName>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const keys = await prisma.apiKey.findMany({
    where: { id: { in: wanted }, userId },
    select: { id: true, name: true, revokedAt: true },
  });
  return new Map(keys.map((k) => [k.id, { name: k.name, revokedAt: k.revokedAt }]));
}

/** The row label for the viewer's requests that came by session cookie, not key. */
const DASHBOARD_LABEL = "dashboard";

/**
 * How one of the viewer's own requests is labelled — the one rule behind
 * both the Who rows and the Log's `You · …`: the key's name when a key was
 * used, "dashboard" for a session request. The two fallbacks are guards,
 * not cases: a key row is only ever revoked, never deleted, and a request
 * without a key is a session one.
 */
function ownLabel(
  row: { apiKeyId: string | null; credential: Credential },
  names: Map<string, KeyName>,
): { label: string; revoked: boolean } {
  if (row.apiKeyId !== null) {
    const key = names.get(row.apiKeyId);
    return key
      ? { label: key.name, revoked: key.revokedAt !== null }
      : { label: "unknown key", revoked: false };
  }
  return { label: row.credential === "session" ? DASHBOARD_LABEL : "unknown", revoked: false };
}

// ---------------------------------------------------------------------------
// Log: the raw entries, paginated.

export type LogEntry = {
  id: string;
  at: Date;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  /** Already rendered: `You · prod-api`, `You · dashboard`, `acct-7f3a`, `Anonymous`. */
  who: string;
};

export type LogPage = {
  entries: LogEntry[];
  /** Opaque; hand it back to `entries` for the next page. Null on the last page. */
  nextCursor: string | null;
};

export const LOG_PAGE_SIZE = 50;

/** The `who` column's fixed words. */
const YOU = "You";
const ANONYMOUS = "Anonymous";

type Cursor = {
  /** ISO-8601 in UTC with microseconds — the column's full precision. */
  at: string;
  id: string;
};

/**
 * The cursor is the last entry's `(at, id)`, base64url-encoded so it rides in
 * client state as one string. `at` is carried as text at the column's
 * microsecond precision rather than as a Date: a JS Date holds milliseconds,
 * and a truncated cursor would skip every entry whose `at` sits between the
 * truncation and the true value.
 */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** The inverse; null for anything that is not one of ours. */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (typeof parsed !== "object" || parsed === null) return null;
    const { at, id } = parsed as Record<string, unknown>;
    if (typeof at !== "string" || typeof id !== "string") return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(at)) return null;
    return { at, id };
  } catch {
    return null;
  }
}

type EntryRow = {
  id: string;
  at: Date;
  /** `at` as text, microseconds and all, for the cursor. */
  atText: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  credential: Credential;
  actorUserId: string | null;
  apiKeyId: string | null;
};

/**
 * One page of entries under the page's filters, newest first, keyset-
 * paginated on `(at, id)` so a page boundary inside a burst of identical
 * timestamps neither repeats nor drops an entry. The page is fetched one
 * over size to learn whether a next page exists. `who` is rendered here for
 * the same reason `actors` maps handles here: no other account's id reaches
 * the page.
 */
export async function entries(
  q: TrafficQuery,
  cursor: string | null,
  now: Date = new Date(),
): Promise<LogPage> {
  const grid = bucketGrid(q.range, now);
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await prisma.$queryRaw<EntryRow[]>`
    SELECT id,
           at,
           to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "atText",
           method,
           path,
           status,
           duration_ms   AS "durationMs",
           credential,
           actor_user_id AS "actorUserId",
           api_key_id    AS "apiKeyId"
    FROM access_logs
    WHERE ${rangeSql(q, grid, now)}
      ${after ? Prisma.sql`AND (at, id) < (${after.at}::timestamptz, ${after.id})` : Prisma.empty}
    ORDER BY at DESC, id DESC
    LIMIT ${LOG_PAGE_SIZE + 1}`;

  const page = rows.slice(0, LOG_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > LOG_PAGE_SIZE && last ? encodeCursor({ at: last.atText, id: last.id }) : null;

  const names = await keyNames(
    q.userId,
    page.map((r) => (r.actorUserId === q.userId ? r.apiKeyId : null)),
  );
  const who = (r: EntryRow): string => {
    if (r.actorUserId === null) return ANONYMOUS;
    if (r.actorUserId !== q.userId) return handleFor(q.userId, r.actorUserId);
    return `${YOU} · ${ownLabel(r, names).label}`;
  };
  return {
    entries: page.map((r) => ({
      id: r.id,
      at: r.at,
      method: r.method,
      path: r.path,
      status: r.status,
      durationMs: r.durationMs,
      who: who(r),
    })),
    nextCursor,
  };
}
