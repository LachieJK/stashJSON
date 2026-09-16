import { Prisma, type User } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { PLANS, QUOTA_RESOURCES, type QuotaResource } from "@/lib/plans";
import { countOwned } from "@/lib/quotas";
import type { StatusClass } from "@/lib/statusClass";
import type { CredFilter, Range } from "@/lib/usageFilters";

/**
 * Everything the Usage page reads, server-side only (decision in #60: no
 * public usage API — the aggregates live here and are called from the page).
 * This slice ships the resource picker and the plan headroom; the access-log
 * aggregates (traffic, warnings, heatmap, actors) arrive in the next slices.
 * The URL filters are in `lib/usageFilters.ts`, kept free of `lib/db` so the
 * client-side controls can import them.
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
 * (`?resource=<id>` from a workspace page, next slice) still works for any id.
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

/** The page's filters as the aggregates take them: the owner plus the three URL controls. */
export type TrafficQuery = {
  userId: string;
  range: Range;
  cred: CredFilter;
  /** A workspace or document id, or null for everything the owner has. */
  resource: string | null;
};

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
      SELECT date_bin(make_interval(secs => ${grid.widthMs / 1000}), at, ${grid.start}::timestamptz) AS bucket,
             date_bin('1 minute', at, ${grid.start}::timestamptz) AS minute,
             count(*) FILTER (WHERE status < 400)                                        AS ok,
             count(*) FILTER (WHERE status >= 400 AND status < 500 AND status <> 429)    AS client_error,
             count(*) FILTER (WHERE status = 429)                                        AS throttled,
             count(*) FILTER (WHERE status >= 500)                                       AS server_error,
             count(*)                                                                    AS n
      FROM access_logs
      WHERE ${scopeSql(q)}
        AND at >= ${grid.start}::timestamptz
        AND at < ${now}::timestamptz
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
    WHERE ${scopeSql(q)}
      AND at >= ${grid.start}::timestamptz
      AND at < ${now}::timestamptz`;
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
 * Throttled counts every 429 the log attributes to the owner. A public read
 * by a stranger bills the owner's `:api` bucket and is logged with the owner,
 * so their traffic throttling this account is exactly what the rule is for.
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
        AND status IN (401, 403, 404)
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
