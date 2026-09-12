import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Per-account token-bucket rate limiter, backed by a single Postgres statement.
 *
 * The storage backend lives entirely behind `consume()`: the SQL, the table and
 * the driver are the only Postgres-specific things in the file, so swapping to
 * Redis later is a one-file change. Everything else here is the wire contract —
 * the `X-RateLimit-*` headers and the `429` body — which is transport, not
 * storage, and would survive that swap unchanged.
 */

/** The RFC 9457 problem-type URI for a rate-limit rejection; the docs anchor. */
export const RATE_LIMIT_ERROR_TYPE =
  "https://stashjson.com/docs/errors/rate-limit-exceeded";

/** The bucket table. Indexed on `key` only — see the migration's reloptions. */
const TABLE = "rate_limit_bucket";

/**
 * The two numbers that define a bucket: `refillPerSecond` is the sustained rate
 * `/pricing` advertises, `capacity` is the (unadvertised) burst ceiling. A
 * never-refilling bucket (`refillPerSecond: 0`) is a legitimate bucket — it is
 * invalid only as a *plan*, which is why `lib/plans.ts`, not `consume()`, is
 * where `refillPerSecond <= 0` is rejected.
 */
export type BucketPolicy = {
  capacity: number;
  refillPerSecond: number;
};

export type Decision = {
  allowed: boolean;
  /** The advertised limit — `capacity`, for `X-RateLimit-Limit`. */
  limit: number;
  /** Whole tokens left after this call. Fractional tokens buy nothing. */
  remaining: number;
  /** When the bucket is next full again, for `X-RateLimit-Reset`. */
  resetAt: Date;
  /** Delta-seconds for `Retry-After`. Zero when allowed. */
  retryAfterSeconds: number;
  /** Exact fractional balance after this call; `remaining` is its floor. */
  tokens: number;
  /** The clock the decision was made against — Postgres's, not the app's. */
  at: Date;
};

/**
 * The whole limiter, as one statement.
 *
 * The upsert is the load-bearing part. `INSERT ... ON CONFLICT DO UPDATE` is
 * atomic: on a conflict Postgres takes a row lock, and when a concurrent
 * transaction has already updated that row it re-reads the updated version
 * before evaluating the `DO UPDATE` — so the refill arithmetic and the
 * decrement both see the winner's result rather than a stale snapshot. That is
 * what serialises concurrent consumers of one key without an advisory lock; the
 * lock would only add a second contention point this statement does not need.
 *
 * The `WHERE` on the `DO UPDATE` is what refuses to overspend: when the refilled
 * balance is under one token the update is skipped, so a rejected caller's
 * bucket is untouched and a `429` spends nothing.
 *
 * A skipped update returns no row, which would otherwise cost a second query to
 * compute the caller's wait. The `UNION ALL` branch avoids it: a data-modifying
 * CTE and the outer query run in one statement, and the branch executes only
 * when the upsert returned nothing — i.e. exactly on rejection — recomputing the
 * refilled balance so the rejected caller still gets an honest `Retry-After`.
 * Under concurrency that recomputed balance reads the statement's snapshot and
 * can be marginally stale; the allow/deny decision always comes from the live
 * upsert.
 *
 * `now()` is transaction-start time, constant across the statement. `$4`
 * overrides it for tests only; nothing in `app/` ever passes it.
 */
function consumeSql(table: string): string {
  // Written once, used in three places: the upsert's SET, the upsert's WHERE,
  // and the rejection branch. All three must agree or the limiter is wrong.
  const refilled = (alias: string) =>
    `LEAST($2::float8, ${alias}.tokens + EXTRACT(EPOCH FROM (COALESCE($4::timestamptz, now()) - ${alias}.updated_at))::float8 * $3::float8)`;

  return `
    WITH spent AS (
      INSERT INTO ${table} AS b (key, tokens, updated_at)
      VALUES ($1::text, $2::float8 - 1, COALESCE($4::timestamptz, now()))
      ON CONFLICT (key) DO UPDATE
         SET tokens = ${refilled("b")} - 1,
             updated_at = COALESCE($4::timestamptz, now())
       WHERE ${refilled("b")} >= 1
      RETURNING b.tokens AS tokens, true AS allowed
    )
    SELECT tokens, allowed, COALESCE($4::timestamptz, now()) AS at FROM spent
    UNION ALL
    SELECT ${refilled("b")} AS tokens, false AS allowed, COALESCE($4::timestamptz, now()) AS at
      FROM ${table} b
     WHERE b.key = $1::text
       AND NOT EXISTS (SELECT 1 FROM spent)
  `;
}

const SQL = consumeSql(TABLE);

type Row = { tokens: number; allowed: boolean; at: Date };

/**
 * Charge one token against `key` and decide whether the request may proceed.
 *
 * Throws rather than deciding on failure: fail-open is the caller's policy, so a
 * limiter error reaches `requireUser`, is logged there, and the request is let
 * through. `at` is test-only (the injected clock); production lets the statement
 * use `now()`.
 */
export async function consume(
  key: string,
  policy: BucketPolicy,
  at?: Date,
): Promise<Decision> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    SQL,
    key,
    policy.capacity,
    policy.refillPerSecond,
    at ?? null,
  );

  // Empty only if the row was deleted between the upsert and the rejection
  // branch — i.e. by the stale-row cleanup this map explicitly defers. Throwing
  // is correct: the caller fails open on a limiter error.
  const row = rows[0];
  if (!row) throw new Error(`rate-limit bucket ${key} vanished mid-statement`);

  const refill = policy.refillPerSecond;
  const deficit = Math.max(0, 1 - row.tokens);
  let retryAfterSeconds: number;
  if (row.allowed) {
    retryAfterSeconds = 0;
  } else if (refill > 0) {
    retryAfterSeconds = Math.ceil(deficit / refill);
  } else {
    retryAfterSeconds = Infinity;
  }

  // When the bucket is full again: the gap to capacity divided by the rate.
  const secondsUntilFull =
    refill > 0 ? Math.max(0, policy.capacity - row.tokens) / refill : 0;

  return {
    allowed: row.allowed,
    limit: policy.capacity,
    remaining: Math.max(0, Math.floor(row.tokens)),
    resetAt: new Date(row.at.getTime() + secondsUntilFull * 1000),
    retryAfterSeconds,
    tokens: row.tokens,
    at: row.at,
  };
}

// --- Wire contract (transport, not storage) -------------------------------

// A request's decision, stashed by `requireUser` (where the metering happens)
// for `withRateLimit` to stamp onto the response. Keyed by the `Request`, so it
// is cleaned up when the request is collected.
const decisions = new WeakMap<Request, Decision>();

/** Record a request's rate-limit decision for `withRateLimit` to stamp. */
export function recordDecision(req: Request, decision: Decision): void {
  decisions.set(req, decision);
}

function stamp(res: Response, d: Decision): void {
  res.headers.set("X-RateLimit-Limit", String(d.limit));
  res.headers.set("X-RateLimit-Remaining", String(d.remaining));
  res.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(d.resetAt.getTime() / 1000)),
  );
  // A per-caller counter must never ride a shared cache entry.
  res.headers.set("Cache-Control", "private, no-store");
  if (!d.allowed) res.headers.set("Retry-After", String(d.retryAfterSeconds));
}

/**
 * Compose outside `handle()`: stamp the `X-RateLimit-*` trio (and, on a
 * rejection, `Retry-After` plus the RFC 9457 `type`) onto whatever response the
 * handler produced. A route that never resolved an identity records no decision
 * and passes through untouched, so wrapping a route is always safe.
 */
export function withRateLimit<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response>,
): (req: Request, ...args: Args) => Promise<Response> {
  return async (req, ...args) => {
    const res = await handler(req, ...args);
    const decision = decisions.get(req);
    if (!decision) return res;
    if (decision.allowed) {
      stamp(res, decision);
      return res;
    }
    // Rejection: add the `type` alongside the `{ detail }` the handler threw.
    const body = await res
      .json()
      .catch(() => ({ detail: "API rate limit exceeded" }));
    const rejected = NextResponse.json(
      { ...body, type: RATE_LIMIT_ERROR_TYPE },
      { status: 429 },
    );
    stamp(rejected, decision);
    return rejected;
  };
}
