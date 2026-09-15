# CONTEXT

A short domain glossary for StashJSON. It defines the core terms, states the
versioning rule in one place, and records work that was deliberately deferred so
it is not re-proposed as a fresh idea.

## Core terms

- **Document** — a stored JSON value with a stable id, an owner, a visibility
  flag, and a monotonically increasing **version** number. Its data is held as
  native JSONB.
- **Workspace** — a named container a document may belong to. Deleting a
  workspace does not delete its documents; it detaches them (their `workspaceId`
  is nulled).
- **Template** — an optional JSON Schema attached 1:1 to a workspace. When
  present, every document written into that workspace must satisfy it.
- **Version** — an entry in a document's history. Each entry is a snapshot of the
  document's data as it was *before* an update overwrote it. "Version" is the
  project's single word for this concept — there is no "revision".

## The versioning rule

Every change to a document's **data** cuts a version: the current data is
snapshotted into the history, the version number is incremented by exactly one,
and the new data is written — all atomically, in one transaction. A change that
touches only visibility cuts no version and does not move the number. An update
that carries no meaningful data is a no-op that leaves the document untouched.

For a partial (merge) update, the workspace template is validated against the
**merged result**, not the incoming fragment — a fragment that looks valid alone
must not merge into an invalid document.

This rule has exactly one owner in the code: `updateDocument` in
`lib/documents.ts`. Both update route handlers (`PUT` and `PATCH` on
`/api/documents/:id`) are thin translations that call it.

## Rate limiting

- **Bucket** — the per-account token bucket a request is charged against. Its
  key is `user:<id>:<surface>`; its policy is `{ capacity, refillPerSecond }`.
- **Surface** — which of a user's two buckets a request spends: `:api` (the tier
  quota `/pricing` sells, shared by all of the user's API keys) or `:dashboard`
  (a flat, unadvertised ceiling for session-cookie requests). A public read of a
  document spends the **owner's** `:api` bucket, whoever is reading.
- **Metered** — charged one token on identity resolution. A route is metered
  because it authenticates, not because it opted in; `/api/health` and
  `/api/auth/**` are the only exemptions, each with a reason in
  `tests/unit/routeCoverage.test.ts`.

The design and its rejected alternatives are recorded in
[ADR-0001](docs/adr/0001-per-account-rate-limiting.md). `lib/rateLimit.ts` is
the swap seam: the Postgres statement and table live behind `consume()` and are
the only storage-specific code, so a different backend is a one-file change.

## Plans and quotas

- **Quota** — a per-tier cap on how many of a countable resource an account may
  hold: workspaces, documents, API keys. A quota is checked when a resource is
  **created** and never when it is read or written: an account over its quota
  (after a downgrade, say) keeps everything it has and is refused only new
  creates until it upgrades or deletes. Quotas and the rate-limit policy are
  the two enforced halves of a **plan**; both are defined once, next to the
  tier, so `/pricing` advertises the number the code enforces.
  _Avoid_: limit (ambiguous with rate limit), cap, allowance
- Version-history retention ("7 days of history") is advertised per plan but is
  **not** a quota — it is a time window, not a count — and is not yet enforced.

## Access log

- **Access log** — the record of every request to a route StashJSON controls,
  kept whether or not the request succeeded. An **entry** is one request. The
  log is wider than metering: every metered request is an entry, but a request
  that resolved no identity (a `401`, a `404` on an unknown id) is an entry too.
  Attempted access counts as access.
  _Avoid_: request log, hit, audit log
- **Actor** — the user who made a request, or nobody. An entry's actor is
  whoever the credential resolved to; an anonymous request has none.
- **Owner** — the user whose resource a request targeted, or nobody. An entry
  with no owner means **no resource existed** to be owned — it is never a
  fallback to the actor. On a request against one's own resources, actor and
  owner are the same user; on a public read or a refused read of someone else's
  document, they differ.
- **Handle** — how an owner sees an actor who is not them: a short, stable
  pseudonym (`acct-7f3a`) derived per owner, so the same actor has a different
  handle on every owner's Usage page and two owners cannot link their views.
  It is computed on display, never stored, and never resolves back to a user.
  An owner's own requests are shown as **You** plus the API key's name;
  requests with no actor are **Anonymous**.
  _Avoid_: user id, email, actor name
- **Credential** — how the actor was identified: an API key, a web session, or
  none. This, not any network detail, is the log's anonymous-versus-signed-in
  distinction.
- **Logged** — leaves an entry. Like *metered*, a route is logged by default,
  not by opting in: every `app/api/**/route.ts` except the limiter's two
  exemptions is wrapped, and `tests/unit/routeCoverage.test.ts` fails one that
  is not.

- **Warning** — a signal the Usage page raises from the log, by a fixed rule
  stated in the UI. There are two: a resource is **probed** when it has
  received at least a threshold of refused requests (`401`/`403`/`404`) in the
  trailing hour; an account is **throttled** when any of its `:api` requests
  were refused with `429` in the trailing hour. Because a public read bills
  the owner, a throttled warning can be caused by someone else's traffic. A
  warning is computed, never stored, and never names an actor — see *Handle*.
  _Avoid_: attack, alert, incident

The log holds no personal data beyond user ids the system already stores — no
IP addresses, no user agents, no bodies. That is a decision, not an omission;
its trade-off is recorded in
[ADR-0002](docs/adr/0002-access-log-without-personal-data.md).

## Deferred work

- **Concurrency gap in the snapshot sequence.** `updateDocument` reads the
  current version outside its transaction and then uses that number inside it, so
  two updates racing on the same document can both snapshot the same version:
  the result is a duplicated history entry, a missing one, and a version that
  jumps by two. There is no uniqueness constraint on the version-history table to
  catch this. It is **deliberately deferred** — fixing it would change the public
  contract (introducing a conflict status) and require a schema migration, and
  folding a behaviour change into a behaviour-preserving refactor would destroy
  the regression net. Because the rule now has one home, the fix is a one-place
  change when it becomes worth making. A comment marks the exact lines in
  `lib/documents.ts`.
- **Better Auth's 429 speaks its own dialect.** The limiter on `/api/auth/**`
  (configured in `lib/betterAuth.ts`) returns `{ message }` with a non-standard
  `X-Retry-After` header, not the `{ detail, type }` + `Retry-After` contract the
  rest of the API ratified in #41. That divergence was **accepted deliberately**
  in #41 — it is an internal auth surface, produced inside Better Auth's router,
  and normalising it means wrapping a vendor response. Not an oversight; the
  target shape is known if it is ever worth doing.
- **No credential-stuffing defences beyond the per-IP limiter.** Better Auth has
  no account lockout; brute-force protection on sign-in is the IP+path limiter
  and nothing else, so an attacker rotating IPs is unimpeded. Its `captcha` and
  `haveibeenpwned` plugins are available in the installed package. This is an
  auth threat-model decision, deliberately left out of the rate-limiting work
  (#45) and not yet taken.
- **Tiered access-log retention.** Entries live a flat 30 days for every
  plan. A per-tier window (7 days for FREE, 30 for PRO and above) was
  considered and **deferred**: an entry has both an actor and an owner who may
  be on different tiers, so "whose tier decides" is a product call that was not
  worth taking before the log existed at all. Revisit once the dashboards read
  it.
- **Access-log pruning by `pg_cron`.** Old entries are pruned opportunistically
  from application code. Neon's `pg_cron` was **deferred, not rejected**: its
  jobs run only while the compute is active (Neon recommends it only with
  scale-to-zero disabled), and enabling it needs an endpoint API call plus a
  compute restart, so it cannot live in a Prisma migration. Switch once the
  compute no longer scales to zero.
- **Rollups over the access log.** Aggregate tables for date ranges beyond the
  raw retention window are not built. Their shape should be driven by the
  queries real dashboards make, not guessed in advance.
- **Sign-in attack statistics.** `/api/auth/**` is Better Auth's router and is
  outside the access log, for the same reason it is outside our rate limiter.
  Stats on failed sign-ins would have to come from Better Auth's own hooks.
