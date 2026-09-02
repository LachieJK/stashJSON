/**
 * PROTOTYPE — issue #43. Throwaway.
 *
 * The non-interactive half of the prototype: it hammers one key from many
 * concurrent clients and asserts the two properties that cannot be established
 * by reading the SQL — that the limit is never exceeded, and that no grant is
 * lost — then measures whether the HOT-update constraints actually hold under
 * that load.
 *
 * Run: npm run proto:ratelimit:hammer
 */

import { Client } from "pg";
import { createConsumer, type BucketPolicy, type Decision } from "./consume";
import { applySchema, PROTO_DATABASE_URL as DATABASE_URL } from "./setup";

/**
 * The shape of the real statement, with literals in place of parameters so the
 * planner will accept it. Printed to show that the whole decision — refill,
 * check, decrement, and the rejected path's Retry-After — is one statement over
 * one index lookup, with no advisory lock anywhere in the plan.
 */
const EXPLAIN_SQL = `EXPLAIN (COSTS OFF)
  WITH spent AS (
    INSERT INTO proto_rate_limit_bucket AS b (key, tokens, updated_at)
    VALUES ('user:alice:api', 9, now())
    ON CONFLICT (key) DO UPDATE
       SET tokens = LEAST(10::float8, b.tokens) - 1, updated_at = now()
     WHERE LEAST(10::float8, b.tokens) >= 1
    RETURNING b.tokens AS tokens, true AS allowed
  )
  SELECT tokens, allowed FROM spent
  UNION ALL
  SELECT b.tokens, false FROM proto_rate_limit_bucket b
   WHERE b.key = 'user:alice:api' AND NOT EXISTS (SELECT 1 FROM spent)`;

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`  ${ok ? green("PASS") : red("FAIL")}  ${label}`);
  console.log(`        ${dim(detail)}`);
}

/** Fires `workers × each` consumes at one key, as concurrently as the pool allows. */
async function hammer(
  consume: (k: string, p: BucketPolicy) => Promise<Decision>,
  key: string,
  policy: BucketPolicy,
  workers: number,
  each: number,
) {
  let allowed = 0;
  let rejected = 0;
  let errors = 0;
  const started = Date.now();

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let i = 0; i < each; i++) {
        try {
          const d = await consume(key, policy);
          if (d.allowed) allowed++;
          else rejected++;
        } catch {
          errors++;
        }
      }
    }),
  );

  return { allowed, rejected, errors, elapsedMs: Date.now() - started };
}

async function main() {
  const c = createConsumer({ connectionString: DATABASE_URL, connections: 32 });

  // One consumer per storage variant, so section 4 can attribute the HOT cost
  // to the individual constraint rather than to "wrong" in general.
  const VARIANTS = [
    { table: "proto_rate_limit_bucket", label: "key-only index, fillfactor 70  (the design)" },
    { table: "proto_rate_limit_bucket_indexed", label: "index on tokens, fillfactor 70" },
    { table: "proto_rate_limit_bucket_ff100", label: "key-only index, fillfactor 100" },
    { table: "proto_rate_limit_bucket_naive", label: "indexed + fillfactor 100  (naive)" },
  ];
  // Every consumer holds its own pool, and they are all open at once, so keep
  // the total well under Postgres's default max_connections of 100.
  const variantConsumers = VARIANTS.map((v) => ({
    ...v,
    consumer: createConsumer({
      connectionString: DATABASE_URL,
      table: v.table,
      connections: 8,
    }),
  }));

  const MANY = [
    { table: "proto_rate_limit_bucket_many70", label: "fillfactor 70" },
    { table: "proto_rate_limit_bucket_many100", label: "fillfactor 100 (the default)" },
  ];
  const SNAP = [
    { table: "proto_rate_limit_bucket_snap70", label: "fillfactor 70" },
    { table: "proto_rate_limit_bucket_snap100", label: "fillfactor 100 (the default)" },
  ];
  const snapConsumers = SNAP.map((v) => ({
    ...v,
    consumer: createConsumer({
      connectionString: DATABASE_URL,
      table: v.table,
      connections: 8,
    }),
  }));

  const manyConsumers = MANY.map((v) => ({
    ...v,
    consumer: createConsumer({
      connectionString: DATABASE_URL,
      table: v.table,
      connections: 8,
    }),
  }));

  console.log(bold("\n  Resetting the scratch schema\n"));
  await applySchema();

  // ---------------------------------------------------------------- 1
  // The limit is never exceeded, and no grant is lost.
  //
  // refillPerSecond = 0 makes the assertion exact rather than statistical: the
  // bucket never regains a token, so across any amount of concurrency the
  // number of allowed requests must equal `capacity` precisely. Fewer means a
  // grant was lost to a race; more means two callers spent the same token.
  console.log(bold("  1. Correctness under concurrency (64 clients x 40 requests, one key)\n"));

  const strict: BucketPolicy = { capacity: 500, refillPerSecond: 0 };
  const r1 = await hammer(c.consume, "user:alice:api", strict, 64, 40);
  const after = await c.prisma.$queryRawUnsafe<{ tokens: number }[]>(
    `SELECT tokens FROM proto_rate_limit_bucket WHERE key = $1`,
    "user:alice:api",
  );

  console.log(
    dim(
      `        ${r1.allowed + r1.rejected} requests in ${r1.elapsedMs}ms ` +
        `(${Math.round(((r1.allowed + r1.rejected) / r1.elapsedMs) * 1000)}/s), ${r1.errors} errors`,
    ),
  );
  check(
    "the limit is never exceeded",
    r1.allowed <= strict.capacity,
    `allowed ${r1.allowed} <= capacity ${strict.capacity}`,
  );
  check(
    "no grant is lost",
    r1.allowed === strict.capacity,
    `allowed ${r1.allowed} === capacity ${strict.capacity} (rejected ${r1.rejected})`,
  );
  check(
    "the balance agrees with the grants",
    Math.abs(after[0].tokens) < 1e-9,
    `tokens left = ${after[0].tokens}`,
  );
  check("no statement errored", r1.errors === 0, `${r1.errors} errors`);

  // ---------------------------------------------------------------- 2
  // Refill is continuous and lazy, and it is not a source of overspend.
  // Saturating load for a fixed wall-clock window should grant capacity plus
  // the refill accrued over that window, and never meaningfully more.
  console.log(bold("\n  2. Lazy refill under saturating load (capacity 20, 50 tokens/s)\n"));

  const refilling: BucketPolicy = { capacity: 20, refillPerSecond: 50 };
  const t0 = Date.now();
  const r2 = await hammer(c.consume, "user:bob:api", refilling, 32, 60);
  const seconds = (Date.now() - t0) / 1000;
  const ceiling = refilling.capacity + refilling.refillPerSecond * seconds;

  console.log(
    dim(`        ${r2.allowed + r2.rejected} requests over ${seconds.toFixed(3)}s`),
  );
  check(
    "grants never exceed capacity + refill accrued",
    r2.allowed <= Math.ceil(ceiling),
    `allowed ${r2.allowed} <= ${ceiling.toFixed(1)}`,
  );
  check(
    "the bucket does actually refill",
    r2.allowed > refilling.capacity,
    `allowed ${r2.allowed} > capacity ${refilling.capacity}`,
  );

  // ---------------------------------------------------------------- 3
  // A rejected caller gets an honest, usable Retry-After from the same single
  // statement — the UNION ALL branch, not a second round trip.
  console.log(bold("\n  3. The rejected path reports a usable Retry-After\n"));

  const slow: BucketPolicy = { capacity: 2, refillPerSecond: 1 };
  await c.prisma.$executeRawUnsafe(
    `DELETE FROM proto_rate_limit_bucket WHERE key = $1`,
    "user:carol:api",
  );
  await c.consume("user:carol:api", slow);
  await c.consume("user:carol:api", slow);
  const denied = await c.consume("user:carol:api", slow);

  check(
    "the third request is rejected",
    !denied.allowed,
    `allowed=${denied.allowed}, remaining=${denied.remaining}`,
  );
  check(
    "Retry-After is positive and bounded by the refill rate",
    denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 2,
    `Retry-After: ${denied.retryAfterSeconds}s, resetAt ${denied.resetAt.toISOString()}`,
  );

  const beforeReject = await c.prisma.$queryRawUnsafe<{ tokens: number }[]>(
    `SELECT tokens FROM proto_rate_limit_bucket WHERE key = $1`,
    "user:carol:api",
  );
  const rejectedAgain = await c.consume("user:carol:api", slow);
  check(
    "a rejection spends nothing (no penalty box, #36)",
    rejectedAgain.tokens >= beforeReject[0].tokens,
    `balance ${beforeReject[0].tokens.toFixed(4)} -> ${rejectedAgain.tokens.toFixed(4)} across a 429`,
  );

  // ---------------------------------------------------------------- 4
  // The HOT-update constraints. The same workload against the constrained table
  // and against a control that indexes the churning columns at fillfactor 100.
  console.log(bold("\n  4. HOT updates: constrained table vs naive control\n"));

  const churn: BucketPolicy = { capacity: 1e9, refillPerSecond: 0 };
  for (const v of VARIANTS) {
    await c.prisma.$executeRawUnsafe(
      `SELECT pg_stat_reset_single_table_counters($1::regclass::oid)`,
      v.table,
    );
  }

  for (const v of variantConsumers) {
    await hammer(v.consumer.consume, "user:hot:api", churn, 16, 250);
  }

  // 4b. The same question at realistic shape: 400 buckets sharing heap pages,
  // every one of them churning. autovacuum is off on this pair so the result
  // reflects fillfactor and HOT pruning alone, not a vacuum that happened to
  // run mid-measurement.
  for (const v of MANY) {
    await c.prisma.$executeRawUnsafe(
      `SELECT pg_stat_reset_single_table_counters($1::regclass::oid)`,
      v.table,
    );
  }

  const MANY_KEYS = Array.from({ length: 400 }, (_, i) => `user:u${i}:api`);
  for (const v of manyConsumers) {
    await Promise.all(
      Array.from({ length: 16 }, async (_, w) => {
        for (let round = 0; round < 25; round++) {
          for (let i = w; i < MANY_KEYS.length; i += 16) {
            await v.consumer.consume(MANY_KEYS[i], churn);
          }
        }
      }),
    );
  }

  // 4c. The same churn, but with pruning disabled by an open snapshot.
  for (const v of SNAP) {
    await c.prisma.$executeRawUnsafe(
      `SELECT pg_stat_reset_single_table_counters($1::regclass::oid)`,
      v.table,
    );
  }

  for (const v of snapConsumers) {
    // Seed every row first, so the snapshot below predates all the updates
    // whose dead versions it will then pin.
    for (const k of MANY_KEYS) await v.consumer.consume(k, churn);

    const holder = new Client({ connectionString: DATABASE_URL });
    await holder.connect();
    await holder.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await holder.query(`SELECT count(*) FROM ${v.table}`);

    await Promise.all(
      Array.from({ length: 16 }, async (_, w) => {
        for (let round = 0; round < 25; round++) {
          for (let i = w; i < MANY_KEYS.length; i += 16) {
            await v.consumer.consume(MANY_KEYS[i], churn);
          }
        }
      }),
    );

    await holder.query("COMMIT");
    await holder.end();
  }

  // EXPLAIN before the pools close; printed as section 5 below.
  const plan = await c.prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(EXPLAIN_SQL);

  // Backends accumulate their statistics locally and flush them on a timer, so
  // a pool still holding 32 open connections is still holding uncounted
  // updates. Close both pools first: backend exit forces the flush.
  await c.close();
  for (const v of variantConsumers) await v.consumer.close();
  for (const v of manyConsumers) await v.consumer.close();
  for (const v of snapConsumers) await v.consumer.close();
  await new Promise((r) => setTimeout(r, 1000));

  const statsDb = new Client({ connectionString: DATABASE_URL });
  await statsDb.connect();
  const { rows: stats } = await statsDb.query<{
    relname: string;
    n_tup_upd: string;
    n_tup_hot_upd: string;
    pages: string;
    reloptions: string | null;
  }>(`
    SELECT s.relname,
           s.n_tup_upd,
           s.n_tup_hot_upd,
           (pg_relation_size(c.oid) / current_setting('block_size')::int) AS pages,
           array_to_string(c.reloptions, ', ') AS reloptions
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid
     WHERE s.relname LIKE 'proto_rate_limit_bucket%'
     ORDER BY s.relname
  `);
  await statsDb.end();

  const byTable = new Map(stats.map((s) => [s.relname, s]));
  const hotPct = (t: string) => {
    const s = byTable.get(t)!;
    const upd = Number(s.n_tup_upd);
    return upd > 0 ? (Number(s.n_tup_hot_upd) / upd) * 100 : NaN;
  };

  for (const v of VARIANTS) {
    const s = byTable.get(v.table)!;
    const upd = Number(s.n_tup_upd);
    const hot = Number(s.n_tup_hot_upd);
    console.log(`        ${bold(v.label)}`);
    console.log(
      dim(
        `          ${hotPct(v.table).toFixed(1)}% HOT  (${hot}/${upd})   ` +
          `heap ${s.pages} pages   reloptions [${s.reloptions ?? "none"}]`,
      ),
    );
  }
  console.log("");

  const tuned = byTable.get("proto_rate_limit_bucket")!;

  check(
    "the design updates almost entirely HOT",
    hotPct("proto_rate_limit_bucket") > 95,
    `${hotPct("proto_rate_limit_bucket").toFixed(1)}% of updates were HOT`,
  );
  check(
    "indexing a churning column forfeits HOT outright, fillfactor notwithstanding",
    hotPct("proto_rate_limit_bucket_indexed") < 1,
    `index on tokens: ${hotPct("proto_rate_limit_bucket_indexed").toFixed(1)}% HOT ` +
      `vs ${hotPct("proto_rate_limit_bucket").toFixed(1)}% for the design`,
  );
  // Deliberately NOT a pass/fail check. On a one-row table both fillfactors sit
  // at ~99% HOT, because pruning always reclaims space on the single page. The
  // number is reported so the non-result is visible rather than quietly
  // rounded into a claim the measurement does not support; 4b is the test that
  // can actually separate them.
  console.log(
    dim(
      `\n        note: on a single-row table fillfactor barely registers — ` +
        `100: ${hotPct("proto_rate_limit_bucket_ff100").toFixed(1)}% HOT vs ` +
        `70: ${hotPct("proto_rate_limit_bucket").toFixed(1)}%. See 4b.`,
    ),
  );
  check(
    "the reloptions from schema.sql are live on the table",
    (tuned.reloptions ?? "").includes("fillfactor=70") &&
      (tuned.reloptions ?? "").includes("autovacuum_vacuum_scale_factor=0.01") &&
      (tuned.reloptions ?? "").includes("autovacuum_vacuum_threshold=50"),
    tuned.reloptions ?? "no reloptions",
  );

  console.log(
    bold("\n  4b. fillfactor at realistic shape (400 buckets, all churning, autovacuum off)\n"),
  );
  for (const v of MANY) {
    const st = byTable.get(v.table)!;
    console.log(`        ${bold(v.label)}`);
    console.log(
      dim(
        `          ${hotPct(v.table).toFixed(1)}% HOT  (${Number(st.n_tup_hot_upd)}/${Number(st.n_tup_upd)})   ` +
          `heap ${st.pages} pages`,
      ),
    );
  }
  // Also reported rather than asserted: sharing pages is not enough to make
  // fillfactor matter either, because pruning still keeps up. 4c is what
  // finally separates them.
  console.log(
    dim(
      `        note: still no separation — ` +
        `70: ${hotPct("proto_rate_limit_bucket_many70").toFixed(1)}% vs ` +
        `100: ${hotPct("proto_rate_limit_bucket_many100").toFixed(1)}%.`,
    ),
  );

  console.log(
    bold("\n  4c. The same, with an open snapshot blocking HOT pruning\n"),
  );
  for (const v of SNAP) {
    const st = byTable.get(v.table)!;
    console.log(`        ${bold(v.label)}`);
    console.log(
      dim(
        `          ${hotPct(v.table).toFixed(1)}% HOT  (${Number(st.n_tup_hot_upd)}/${Number(st.n_tup_upd)})   ` +
          `heap ${st.pages} pages`,
      ),
    );
  }
  check(
    "with pruning blocked, fillfactor 70 keeps more updates HOT than the default",
    hotPct("proto_rate_limit_bucket_snap70") >
      hotPct("proto_rate_limit_bucket_snap100"),
    `70: ${hotPct("proto_rate_limit_bucket_snap70").toFixed(1)}% HOT vs ` +
      `100: ${hotPct("proto_rate_limit_bucket_snap100").toFixed(1)}% HOT`,
  );

  // ---------------------------------------------------------------- 5
  // One round trip. EXPLAIN proves the whole decision is a single statement
  // over a single index lookup, with no advisory lock in sight.
  console.log(bold("\n  5. The plan (one statement, one index lookup)\n"));
  for (const line of plan) console.log(dim(`        ${line["QUERY PLAN"]}`));

  console.log(
    failures === 0
      ? green(bold(`\n  All checks passed.\n`))
      : red(bold(`\n  ${failures} check(s) failed.\n`)),
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
