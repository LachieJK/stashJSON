# ADR-0001: Per-account API rate limiting

**Status:** Accepted (2026-09-13)
**Decided in:** map [#32](https://github.com/LachieJK/stashJSON/issues/32) and its tickets [#33](https://github.com/LachieJK/stashJSON/issues/33)–[#43](https://github.com/LachieJK/stashJSON/issues/43); built in [#46](https://github.com/LachieJK/stashJSON/issues/46), [#47](https://github.com/LachieJK/stashJSON/issues/47), [#48](https://github.com/LachieJK/stashJSON/issues/48)
**Code:** `lib/rateLimit.ts` (the limiter and the wire contract), `lib/auth.ts` (where metering happens), `lib/plans.ts` (the per-tier numbers), `prisma/migrations/20260912000000_add_rate_limit_bucket`
**Public contract:** [`/docs/errors/rate-limit-exceeded`](../../app/(marketing)/docs/errors/rate-limit-exceeded/page.tsx)

## Context

StashJSON sells tiered API throughput on `/pricing` and enforced none of it.
Each `User` has a `tier`, each tier promises a request rate, and any API key
could call any route as fast as the database would answer. The limit had to be
**per account** (the thing `/pricing` prices), had to read `User.tier`, and had
to hold on both deployment targets still under consideration — Vercel and a
single long-lived container — without deciding between them.

The real numbers are placeholders (60 / 600 / 6,000 requests per minute).
Choosing them is a product exercise outside this decision.

## Decision

A **token bucket per account, stored in Postgres, charged from the code that
resolves the caller's identity.**

- **One narrow interface.** `consume(key, policy) → Decision` in
  `lib/rateLimit.ts` is the whole limiter. The SQL, the `rate_limit_bucket`
  table and the driver are the only storage-specific things in the file, so
  moving to Redis (or anything else) is a one-file swap. The `X-RateLimit-*`
  headers and the `429` body live in the same file but are transport, not
  storage, and survive that swap unchanged.
- **Metering rides on identity resolution, not on routes.** `consume()` is
  called from `requireUser` and `requireSessionUser` (`lib/auth.ts`) and from
  `assertCanRead` (`lib/documents.ts`) — never from the nullable resolvers,
  which would double-bill. A route is metered by the fact that it
  authenticates, so a new route is metered the day it is written.
  `tests/unit/routeCoverage.test.ts` makes this a property: every
  `app/api/**/route.ts` either reaches one of those entrypoints and wraps its
  handlers in `withRateLimit`, or is in an `EXEMPT` list with a reason.
- **The user is the identity; the credential kind selects the policy.**
  `user:<id>:api` carries the tier quota `/pricing` advertises;
  `user:<id>:dashboard` is a flat, non-tiered high ceiling that is never
  advertised, so a runaway dashboard can neither exhaust the tier quota nor be
  a way to obtain capacity it does not pay for. All of a user's API keys share
  the one `:api` bucket — no per-key allowance, no attribution; revoke a
  runaway key. A **public-document read bills the owner's** `:api` bucket
  whoever is reading (the dashboard warns at the public toggle), so no
  capacity exists that signing out unlocks.
- **One bucket, two numbers.** `refillPerSecond` is the advertised sustained
  rate; `capacity` is the burst ceiling. Refill is continuous and lazy on
  Postgres `now()` — two columns (`tokens`, `updated_at`), no scheduler. A
  rejected request spends nothing; a failed one (`400`/`403`/`404`/`500`)
  spends one token like a success, because quota is charged **up front** in
  the same round trip that decides.
- **Fail open, structurally.** `consume()` throws on error and the caller lets
  the request through with a logged alarm. This is not a probabilistic bet:
  `consume()` is unreachable without a successful Postgres round trip
  immediately before it (identity resolution *is* a DB query), so a limiter
  failure means the database is already faltering. Failing closed would buy
  zero enforcement and could only turn a blip into an outage.
- **The numbers live on the plan record.** Each tier in `lib/plans.ts`
  carries `{ capacity, refillPerSecond }`; `PLANS` is `Record<PlanTier, Plan>`
  keyed by the Prisma enum so `PLANS[user.tier]` is total. `/pricing` derives
  its rate bullet from `refillPerSecond` via `rateLimitFeature()` rather than
  typing it, so the page cannot advertise a rate the code does not enforce.
  `capacity` is discoverable (`X-RateLimit-Limit`) but not marketed.
- **The wire contract.** `429` for every rejection, body `{ detail, type }`
  with `type` pointing at the docs anchor above; `Retry-After` in
  delta-seconds; the legacy `X-RateLimit-Limit` / `-Remaining` / `-Reset` trio
  on every response, `2xx` included; `Cache-Control: private, no-store` so a
  per-caller counter can never ride a shared cache entry.
  `Access-Control-Expose-Headers` in `middleware.ts` lets browsers read them.
  `withRateLimit()` is composed *outside* `handle()` so it stamps any response
  without touching `ApiError` or its throw sites.
- **Exemptions.** `/api/health` — resolves no identity, so there is no bucket
  to charge; safe only because it is DB-free, which the coverage test
  enforces. `/api/auth/**` — Better Auth runs its own per-IP limiter there
  ([#39](https://github.com/LachieJK/stashJSON/issues/39)); per-account keying
  cannot protect unauthenticated sign-in, and layering ours on top would put
  two conflicting `429` shapes on the same paths. Its `{ message }` +
  `X-Retry-After` dialect is accepted and documented, not normalised
  ([#45](https://github.com/LachieJK/stashJSON/issues/45)).
- **Testing the clock.** `consume(key, policy, at?)` takes the clock as a SQL
  parameter (`COALESCE($4, now())`). Tests inject `at`; nothing in `app/` ever
  passes it. No fake timers, no clock abstraction.

## Alternatives rejected

These are the expensive part of this record. Each was investigated, not
assumed.

### Edge / WAF / Neon instead of application code ([#33](https://github.com/LachieJK/stashJSON/issues/33))

Neon has no request-layer rate limiting at all — only control-plane limits on
`api.neon.tech`; its knobs bound blast radius, not callers. Edge products
(Cloudflare, Vercel WAF) do per-IP limiting cheaply, but **none can read
`User.tier` at any price**, so the per-account quota has to be application
code. Gateway products (AWS API Gateway usage plans, Kong, Tyk, Zuplo) can do
tiered per-consumer limits with our DB kept authoritative via a custom
authorizer — rejected as a large dependency taken on to avoid a small amount
of code. A per-IP burst shield remains a deployment-time, vendor-specific
addition and is explicitly out of scope here.

### In `middleware.ts` ([#34](https://github.com/LachieJK/stashJSON/issues/34))

The Edge runtime cannot open a TCP socket, so Prisma cannot run there; the
limiter would have needed a second, HTTP-based store. Next.js 16 also
deprecates `middleware.ts` in favour of `proxy.ts`, so anything built there
would be built on a moving target. Metering therefore lives behind identity
resolution in Node route handlers. In-memory counters were rejected with the
same stroke: unsound on any multi-instance host, and Vercel KV is
discontinued.

### Separate burst and sustained policies ([#36](https://github.com/LachieJK/stashJSON/issues/36))

A second policy's only real job — bounding the burst — is exactly what a token
bucket's `capacity` already does. One bucket with `{ capacity,
refillPerSecond }` covers both, with an interface that is additive should a
volume cap ever be wanted. GCRA was considered and rejected as overkill for two
columns.

### Fail closed ([#42](https://github.com/LachieJK/stashJSON/issues/42))

See the decision above: `consume()` runs only after a successful DB round
trip, so fail-closed can never add enforcement, only outages. Reserve-then-
refund (charge, then credit back on rejection) was rejected as a second round
trip on every request; charging at the end was rejected because the limit
would be unenforced while requests are in flight. `401`s are free by
construction — no user resolved, no bucket — and billing a revoked key's
owner was rejected. Accepted cost: unauthenticated traffic is unmetered yet
still costs a `keyHash` lookup per request; only the out-of-scope per-IP
shield answers that.

### Per-account overrides, DB-backed limits, env vars ([#40](https://github.com/LachieJK/stashJSON/issues/40))

- **Per-account overrides** — `User` gains no limit columns. Rejected, not
  deferred: every override is a support conversation and a number nobody can
  see on `/pricing`.
- **A separate `lib/rateLimits.ts`** — a second table of numbers to keep
  aligned with the plan catalog by hand, which is the drift this design
  exists to prevent.
- **Env vars** — `/pricing` would advertise a rate that varies by deploy.
- **A database table** — unversioned, needs seeding this repo has no
  mechanism for, and only pays off with the overrides that were rejected.

### `pg_advisory_xact_lock` around the upsert ([#43](https://github.com/LachieJK/stashJSON/issues/43))

Neon's published token-bucket guide takes an advisory lock per key. Measured
unnecessary: the lock-free `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
statement, under 64 concurrent clients issuing 2,560 requests against a
`capacity: 500` bucket with refill disabled, granted **exactly 500**, left the
balance at exactly `0`, and raised zero errors at ~4,700 statements/second.
Postgres already serialises the conflicting updates on the row lock and
re-evaluates `DO UPDATE` against the winner's version; the advisory lock
would only add a second contention point.

### Shadow / log-only rollout

Rejected: a second code path and a deploy-varying behaviour, the same shape
rejected for env-var limits. Fail-open is structural, so the blast radius of
enforcing from day one is bounded by construction.

## Storage notes — what the measurements do and do not support

Two claims made while planning were corrected by
[#43](https://github.com/LachieJK/stashJSON/issues/43)'s measurements. This
record carries the corrected versions; do not "fix" them back.

- **Index the key column only.** This part is decisive: adding one index on
  `tokens` took HOT updates from 99.3% to **zero**.
- **`fillfactor = 70` is insurance, not the mechanism.** The map originally
  claimed "the default fillfactor of 100 defeats HOT". Measured false: at
  fillfactor 100 the design still ran **99.2% HOT** on one key and 99.8% across
  400 buckets, because opportunistic page pruning reclaims each page during
  the update. The reloption is kept for the case where pruning is blocked by a
  long-lived snapshot — there it held 60.2% HOT versus 52.8% without — and
  that is the whole of what it buys.
- **The aggressive autovacuum settings are kept but unevidenced.**
  `autovacuum_vacuum_scale_factor = 0.01` and `autovacuum_vacuum_threshold =
  50` are set on the table, but opportunistic pruning did the routine
  reclamation in every run, so nothing measured is attributable to them. They
  are cheap on a table this small and were left in; they have not been
  validated.
- The reloptions are hand-appended to the migration because Prisma's differ
  does not model them. They survive: `prisma migrate diff` reports empty and a
  later `ALTER TABLE` leaves them intact.

## Consequences

- Any new authenticated route is metered with no route-file edit beyond
  wrapping its handlers in `withRateLimit`; forgetting either fails the unit
  suite.
- The rate on `/pricing` and the rate the limiter enforces are the same
  value read from the same field.
- The bucket table's cardinality is bounded by `User` count × two surfaces,
  not by traffic, so there is no stale-row sweep. The `vanished mid-statement`
  throw in `consume()` marks where one would bite if keys ever became
  unbounded.
- The rejection path's `remaining` / `resetAt` are computed from the
  statement's snapshot and can be marginally stale under concurrency; the
  allow/deny decision always comes from the live upsert. Documented on the
  public anchor.
- The IETF draft `RateLimit` / `RateLimit-Policy` headers are deferred until
  the draft is an RFC: adding a header later is free, changing a published
  one is not.
- Deferred, deliberately: user-facing usage visibility beyond the headers,
  the per-IP shield, real limit numbers, and billing that would make `tier`
  change.
