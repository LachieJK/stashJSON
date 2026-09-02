/**
 * PROTOTYPE — issue #43. Throwaway; not wired into any route.
 *
 * THE QUESTION
 * ------------
 * Can a per-account token bucket be enforced correctly by Postgres in a single
 * round trip, with no advisory lock, and stay cheap when the table is hot?
 *
 * The bucket shape is fixed by the decisions already taken: one bucket per key
 * (#36), keyed on the opaque composite `user:<id>:<surface>` (#37), refilled
 * lazily and continuously against Postgres's own clock, with nothing ticking in
 * the background. So the open question is not the algorithm — it is whether one
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` really serialises concurrent
 * callers on one key without losing or double-spending a token, and whether the
 * statement can also report `remaining` / `resetAt` on the *rejected* path
 * without a second round trip.
 *
 * This module is the part worth keeping. It is pure I/O over a narrow surface —
 * `consume(key, policy)` returning a decision — deliberately narrow enough that
 * swapping Postgres for Redis later is a one-file change. The TUI and the
 * hammer around it are throwaway.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../prisma/generated/client";

/**
 * The two numbers that define a bucket, per #36: `refillPerSecond` is the
 * sustained rate `/pricing` sells, `capacity` is the unadvertised burst ceiling.
 */
export type BucketPolicy = {
  capacity: number;
  refillPerSecond: number;
};

export type Decision = {
  allowed: boolean;
  /** The advertised limit — `capacity`, for the `X-RateLimit-Limit` header. */
  limit: number;
  /** Whole tokens left after this call. Fractional tokens buy nothing. */
  remaining: number;
  /** When at least one token is next available. Now, if `remaining` > 0. */
  resetAt: Date;
  /** Delta-seconds for `Retry-After` (#35). Zero when allowed. */
  retryAfterSeconds: number;
  /** Exact fractional balance. Prototype introspection only. */
  tokens: number;
  /** The clock the decision was made against — Postgres's, not the app's. */
  at: Date;
};

/**
 * The whole limiter, as one statement.
 *
 * The upsert is the load-bearing part. `INSERT ... ON CONFLICT DO UPDATE` has
 * been atomic since PG 9.5: on a conflict Postgres takes a row lock, and when a
 * concurrent transaction has already updated that row it *re-reads the updated
 * version* before evaluating the `DO UPDATE` — so the refill arithmetic and the
 * decrement both see the winner's result rather than a stale snapshot. That is
 * what makes concurrent consumers of one key serialise without the
 * `pg_advisory_xact_lock` that Neon's own rate-limiting guide wraps around this
 * shape. The advisory lock would add a second contention point that this
 * statement does not need.
 *
 * The `WHERE` on the `DO UPDATE` is what refuses to overspend: when the refilled
 * balance is under one token the update is skipped entirely, so a rejected
 * caller's bucket is left untouched and a 429 spends nothing (#36).
 *
 * Skipping the update means the upsert returns no row, which would normally
 * cost a second query to find out how long the caller must wait. The
 * `UNION ALL` branch is the fix: a data-modifying CTE and the outer query run in
 * one statement — still one round trip — and the branch only runs when the
 * upsert returned nothing, i.e. exactly on rejection. It recomputes the refilled
 * balance so the rejected caller still gets an honest `Retry-After`.
 *
 * The clock is `now()` throughout — transaction-start time, and therefore
 * constant across every use within the statement. `at` overrides it for tests
 * only; nothing in `app/` would ever pass it.
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

type Row = { tokens: number; allowed: boolean; at: Date };

export type Consumer = {
  consume(key: string, policy: BucketPolicy, at?: Date): Promise<Decision>;
  prisma: PrismaClient;
  close(): Promise<void>;
};

/**
 * Builds a consumer over a Prisma client constructed exactly the way `lib/db.ts`
 * builds the real one — `PrismaClient` on the `@prisma/adapter-pg` driver
 * adapter — to confirm the raw statement composes with the client the app
 * already has, rather than needing a second `pg` pool alongside it.
 */
export function createConsumer(options: {
  connectionString: string;
  table?: string;
  connections?: number;
}): Consumer {
  const table = options.table ?? "proto_rate_limit_bucket";
  const sql = consumeSql(table);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: options.connectionString,
      max: options.connections ?? 20,
    }),
  });

  async function consume(
    key: string,
    policy: BucketPolicy,
    at?: Date,
  ): Promise<Decision> {
    if (policy.capacity < 1) {
      throw new Error("capacity must be at least 1 — a bucket that can never serve a request");
    }

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      sql,
      key,
      policy.capacity,
      policy.refillPerSecond,
      at ?? null,
    );

    // Empty only if the row was deleted between the upsert and the rejection
    // branch — i.e. by the stale-row cleanup this ticket explicitly defers.
    // Throwing is correct: `handle()` fails open on a limiter error (#36).
    const row = rows[0];
    if (!row) throw new Error(`bucket ${key} vanished mid-statement`);

    const deficit = Math.max(0, 1 - row.tokens);
    const waitSeconds =
      policy.refillPerSecond > 0 ? deficit / policy.refillPerSecond : Infinity;

    return {
      allowed: row.allowed,
      limit: policy.capacity,
      remaining: Math.max(0, Math.floor(row.tokens)),
      resetAt: new Date(row.at.getTime() + (Number.isFinite(waitSeconds) ? waitSeconds * 1000 : 0)),
      retryAfterSeconds: row.allowed ? 0 : Math.ceil(waitSeconds),
      tokens: row.tokens,
      at: row.at,
    };
  }

  return { consume, prisma, close: () => prisma.$disconnect() };
}
