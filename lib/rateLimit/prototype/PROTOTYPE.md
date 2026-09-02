# Prototype: the Postgres counter and its atomic upsert

Issue [#43](https://github.com/LachieJK/stashJSON/issues/43). **Throwaway.** Nothing here is
imported by `app/` or `lib/`; it exists to answer a question and to be read afterwards.

```bash
npm run proto:ratelimit          # interactive TUI — drive a bucket by hand
npm run proto:ratelimit:hammer   # the concurrency + storage measurements
bash lib/rateLimit/prototype/seam.sh   # the Prisma migration seam
```

All three need the local Postgres (`docker compose up -d`). They use a scratch database,
`proto_ratelimit`, wiped and recreated on every run — never the app's own.

## The question

Can a per-account token bucket be enforced correctly by Postgres in **one round trip**, with
**no advisory lock**, and stay cheap when the table is hot?

The algorithm was not open: #36 fixed a single token bucket with lazy continuous refill against
Postgres's clock, #37 fixed the key as the opaque composite `user:<id>:<surface>`. What could not
be settled by argument is whether `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` really
serialises concurrent callers on one key without losing or double-spending a token — that is a
property of real SQL under real concurrency — and whether the storage constraints the ticket
lists actually hold.

Measured against PostgreSQL 16.14 (the `postgres:16-alpine` image in `docker-compose.yml`).

## Verdict

The design works, one constraint is more important than the ticket suggests, and one is less.

### 1. One round trip, no advisory lock — confirmed

64 concurrent clients firing 2,560 requests at a single key with `capacity: 500` and refill
disabled granted **exactly 500** requests, left the balance at exactly `0`, and errored zero
times, at ~4,700 statements/second. Refill disabled is what makes that assertion exact rather
than statistical: the bucket never regains a token, so any number other than 500 is a bug —
fewer means a grant was lost to a race, more means two callers spent the same token.

This is the property that lets the advisory lock go. `ON CONFLICT DO UPDATE` has been atomic
since PG 9.5, and on a conflict Postgres re-reads the *updated* row version before evaluating the
`DO UPDATE`, so the refill arithmetic and the decrement both see the winner's result rather than a
stale snapshot. Neon's own rate-limiting guide wraps this shape in `pg_advisory_xact_lock` plus a
separate `SELECT`; the research assessment that this is unnecessary contention **holds**.

`EXPLAIN` confirms the shape — one statement, `Conflict Arbiter Indexes:
proto_rate_limit_bucket_pkey`, one index scan, no lock node.

### 2. The rejected path needed a design addition

The `WHERE` guard on the `DO UPDATE` is what refuses to overspend, and it is also what makes a 429
free: when the refilled balance is under one token the update is skipped entirely, so the bucket is
untouched and a blocked caller recovers at exactly the refill rate (#36's no-penalty-box rule,
verified in the hammer).

But a skipped update returns **no row** — so the obvious implementation has no `remaining` and no
`Retry-After` to report on rejection, and needs a second query to get them. That would put a second
round trip on precisely the path a hammering client takes most often.

The fix is the `UNION ALL` branch in `consumeSql()`: a data-modifying CTE and the outer query are
one statement, so the branch that recomputes the balance for a rejected caller costs no extra round
trip, and it only executes when the upsert returned nothing.

**One caveat worth carrying forward.** That branch reads the statement's snapshot, so under
concurrency a rejected caller's reported `remaining` / `resetAt` can be marginally stale. It is a
header-accuracy question only — the allow/deny decision itself always comes from the upsert, which
sees the live row. Fine for #41 to know about.

### 3. The storage constraints — one decisive, one conditional

Four single-key variants and two multi-key pairs, same workload throughout:

| Table shape | HOT updates |
|---|---|
| key-only index, fillfactor 70 *(the design)* | **99.3%** |
| index on `tokens`, fillfactor 70 | **0.0%** |
| key-only index, fillfactor 100 | 99.2% |
| indexed + fillfactor 100 *(naive)* | 0.0% |

**Index the key column only: confirmed, and it is the whole ballgame.** Adding one index on
`tokens` takes HOT from 99.3% to **zero** — every single update becomes a heap rewrite plus index
maintenance. Fillfactor does not rescue it. This is the constraint to defend in review.

**`fillfactor = 70`: not confirmed as stated, and the ticket overstates it.** The ticket says "the
default of 100 defeats this". It does not, for this workload. At fillfactor 100 the design still
ran at 99.2% HOT on one row, and at 99.8% with 400 buckets sharing heap pages. The reason is
opportunistic HOT pruning: each update prunes the page's dead tuples on the way through, so free
space never runs short and the reserved 30% never binds.

Fillfactor only earns its keep when pruning is blocked — pruning can only remove tuples invisible
to every running transaction, so a long-lived snapshot switches it off. Re-run under a held
`REPEATABLE READ` snapshot:

| Table shape | HOT updates |
|---|---|
| fillfactor 70, pruning blocked | **60.2%** |
| fillfactor 100, pruning blocked | **52.8%** |

So: keep `fillfactor = 70`. It costs a few extra heap pages on a tiny table and it is real
insurance against the bad day — a long transaction elsewhere in the app, a stuck replication slot.
But it is not what makes this table cheap on an ordinary day, and it should not be described as
though it were.

**Aggressive autovacuum: not isolated.** The prototype sets the reloptions and confirms they are
live, but the measurements above show HOT pruning doing the routine space reclamation, so this run
cannot attribute anything to the autovacuum settings specifically. They remain cheap and sensible
for a tiny hot table — just not evidenced here.

### 4. The Prisma seam — `$queryRawUnsafe`, plus a manual migration step

The statement composes with the app's existing client: `consume()` builds `PrismaClient` on
`@prisma/adapter-pg` exactly as `lib/db.ts` does, and runs the SQL through
`$queryRawUnsafe(sql, ...params)` with positional `$1..$4`. No second `pg` pool, no change to
`lib/db.ts`. `$queryRawUnsafe` rather than the `$queryRaw` tag because the parameters repeat
several times across the statement.

`seam.sh` answers the migration half in four steps. Prisma generates the table with **no**
reloptions:

```sql
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key")
);
```

So the fillfactor and autovacuum settings **must be added by hand**, as an `ALTER TABLE ... SET
(...)` appended to the generated migration SQL. The good news is that they then stick:

- after applying them, `prisma migrate diff` against the live database reports
  `-- This is an empty migration.` — Prisma's differ does not model reloptions, so it never tries
  to revert them;
- a later `ALTER TABLE` (adding and dropping a column) leaves them intact.

One Prisma 7 note for whoever writes that migration: the CLI flags moved. `--to-schema-datamodel`
is now `--to-schema`, and `--from-url` is gone in favour of `--from-config-datasource`.

### 5. The interface

```ts
consume(key: string, policy: BucketPolicy, at?: Date): Promise<Decision>
```

`BucketPolicy` is `{ capacity, refillPerSecond }` — #36's two numbers, the sustained rate that
`/pricing` sells and the unadvertised burst ceiling. `Decision` carries `allowed`, `limit`,
`remaining`, `resetAt` and `retryAfterSeconds`, which is everything #35's wire contract needs.

Everything Postgres-specific is inside one file. Swapping to Redis later means reimplementing
`createConsumer` and nothing else.

Two deliberate details:

- **`at` is for tests only.** Production lets the statement use `now()` — transaction-start time,
  constant across the whole statement — rather than the app's `Date.now()`, which on Vercel means
  many short-lived instances with NTP-close-but-unequal clocks (#36). The TUI passes `at` so the
  clock can be jumped forward by hand; the hammer leaves it off and exercises the real path.
- **`consume()` throws rather than deciding.** Fail-open is the caller's policy (#36), so the
  error reaches `handle()` and is logged there rather than being swallowed here.

## Not answered

Out of scope for this ticket and still open: stale-row cleanup (the `vanished mid-statement` throw
in `consume()` is the seam where that will bite), and the actual limit numbers.
