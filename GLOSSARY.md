# StashJSON

A JSON-document store: accounts keep JSON documents, group them into workspaces, and are metered and logged against a plan.

## Documents

**Document**:
A stored JSON value with a stable id, an owner, a visibility (public or private) and a version number.

**Workspace**:
A named container a document may belong to. Deleting a workspace detaches its documents; it never deletes them.

**Template**:
An optional JSON Schema attached to a workspace, which every document in that workspace must satisfy.

**Version**:
A snapshot of a document's data as it was before a data change overwrote it. Every data change cuts exactly one; a visibility-only change cuts none.
_Avoid_: revision

## Plans

**Plan**:
A subscription tier, defined by its rate limit and its quotas.

**Quota**:
A per-plan cap on how many workspaces, documents or API keys an account may hold, checked only when one is created.
_Avoid_: limit, allowance

**Cap**:
The number a quota holds; no cap means unlimited.

## Rate limiting

**Bucket**:
The per-account token bucket a request is charged against, one per surface.

**Surface**:
Which of an account's two buckets a request spends: `api` (the plan's advertised rate, shared by all its API keys) or `dashboard` (a flat ceiling for web-session requests). A public read spends the owner's `api` bucket.

**Metered**:
Charged one token once the request resolves an identity.

## Access log

**Access log**:
The record of every request to a route StashJSON controls, whether or not it succeeded.
_Avoid_: request log, hit, audit log

**Entry**:
One request in the access log.

**Logged**:
Leaves an entry. Every route is logged unless explicitly exempt.

**Actor**:
The user who made a request, or nobody.

**Owner**:
The user whose resource a request targeted, or nobody. No owner means no resource existed; it is never a fallback to the actor.

**Credential**:
How the actor was identified: an API key, a web session, or none.

**Handle**:
A stable pseudonym (`acct-7f3a`) by which an owner sees an actor who is not them, different for every owner.
_Avoid_: user id, email, actor name

**Warning**:
A signal the Usage page raises from the access log by a fixed rule stated in the UI.
_Avoid_: attack, alert, incident

**Probed**:
A warning that a resource drew repeated refused requests (`401`/`403`/`404`) in the trailing hour.

**Throttled**:
A warning that an account had `api` requests refused with `429` in the trailing hour.

## Web sign-in

**Reset link**:
A single-use, one-hour link that lets whoever holds it set a new password for the account it was issued to. Using it ends every web session.
_Avoid_: reset token, recovery link, forgot-password email
