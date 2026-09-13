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
