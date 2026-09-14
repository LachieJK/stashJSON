# ADR-0002: An access log that stores no personal data

**Status:** Accepted (2026-09-14)
**Code:** the `AccessLog` model in `prisma/schema.prisma`; `lib/accessLog.ts`
(the `recordAccess` stash, the `withAccessLog` wrapper, and the after-response
`persistAccess` job that writes the entry and opportunistically runs the
bounded `pruneAccessLog` past `RETENTION_DAYS`), with facts recorded in
`resolveRequestUser` and `requireSessionUser` (`lib/auth.ts`), `assertCanRead`
and `loadOwnedDocument` (`lib/documents.ts`), `loadOwnedWorkspace`
(`lib/workspaces.ts`) and the create/list handlers. Every non-exempt
`app/api/**/route.ts` is wrapped, enforced by `tests/unit/routeCoverage.test.ts`.
**Glossary:** *Access log*, *Actor*, *Owner*, *Credential* in [`CONTEXT.md`](../../CONTEXT.md)

## Context

StashJSON wants per-user dashboards: plan usage, success/error rates per
endpoint, rate-limit pressure, "who is accessing my resources", per-workspace
activity, and warnings when someone is hammering a private document. None of
that exists without a record of every request, so the record comes first and
the dashboards read it later.

The obvious shape of such a record is a web-server access log: IP address,
user agent, path, status. That shape is what makes the table *personal data*
— it turns a stats feature into a retention, disclosure and deletion
obligation, and it is the only thing in this codebase that would be.

## Decision

**Every request to a route StashJSON controls is logged, including the ones
that fail, and no entry carries anything that identifies a caller beyond a
user id the system already holds.**

- **Two identities per entry, both nullable.** `actorUserId` is who made the
  request; `ownerUserId` is whose resource was targeted. They differ on a
  public read and on a refused read of someone else's document. A null owner
  means *no resource existed* (an unknown id) — it is never a fallback to the
  actor. Owner rows cascade with the owner; actor rows are set null when the
  actor is deleted, so the owner's history never shrinks because someone else
  left.
- **Failed requests are entries.** `401`s on private documents and `404`s on
  probed ids are exactly the traffic an owner wants to see. This makes the log
  wider than metering (which deliberately bills nothing when no identity
  resolves) — the two are related but not the same concept.
- **Resource references are snapshots, not foreign keys.** `documentId` and
  `workspaceId` are plain strings as they were at request time. Deleting a
  document must not erase the evidence that it was being probed; a document
  that later moves workspace keeps its old entries with the old workspace.
- **Excluded, by decision:** IP address, user agent, request and response
  bodies, headers, query strings, the API key itself. The anonymous-versus-
  signed-in split is carried by `credential` (`api_key` / `session` / `none`).
- **Best-effort, after the response.** The entry is written once the response
  is on the wire (`after()`); a failure is logged and swallowed. Logging
  decides nothing about the request, so it has no claim to the request path
  and no right to fail it — the same fail-open posture as the rate limiter,
  for a weaker reason.
- **Flat 30-day retention, pruned from application code.** One constant, one
  bounded `DELETE` run opportunistically from the same after-response job.

## The trade-off

Without IP or user agent, an attacker cannot be *identified*, only *noticed*.
"Your private document received 300 refused reads in the last hour" is a
count per resource and survives; "…from three addresses in one range" and any
form of blocking do not. That capability was weighed and given up: the
project would rather ship stats without a personal-data liability than ship
attacker attribution with one. If that changes, the columns can be added, but
nothing before that date can be reconstructed — which is why this is recorded.

## Alternatives rejected

- **Log only requests that resolved an identity.** Simpler, and it would make
  the log identical to metering. Rejected because it blinds the one signal —
  probing and refused reads — that does not need a victim to be signed in.
- **Owner non-nullable, falling back to the actor.** Would show an
  authenticated user's own `404`s as "someone accessed my resource". The null
  is meaningful and kept.
- **Foreign keys to documents and workspaces.** Cascades would eat the history
  the log exists to keep.
- **Await the insert before responding.** A second DB round trip of latency on
  every request, paid by the caller, to guarantee a row that stats can afford
  to lose.
- **Tiered retention (7 days FREE / 30 PRO+).** Deferred, not rejected — see
  `CONTEXT.md`. The unresolved question is whose tier governs an entry that
  has an actor and an owner on different plans.
- **`pg_cron` for pruning.** Deferred — it only runs while the Neon compute is
  awake, and enabling it is an out-of-band endpoint change and restart rather
  than a migration. The swap is intended once the compute stops scaling to
  zero.

## Consequences

- A new route is logged the day it is written: the coverage test requires
  both the rate-limit wrapper and the access-log wrapper on every non-exempt
  `app/api/**/route.ts`. The exemptions are the limiter's (`/api/health`,
  `/api/auth/**`), for the limiter's reasons.
- Sign-in traffic is invisible to the log, so sign-in attack stats are out of
  scope until Better Auth's hooks are wired.
- The table grows with traffic, not with users; the 30-day window and the
  `at` / `(ownerUserId, at)` / `(actorUserId, at)` indexes are what keep
  dashboard queries bounded. Rollups are the intended answer to longer ranges
  and are not built until a real query asks for one.
