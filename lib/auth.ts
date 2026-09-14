import type { User } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/utils";
import { ApiError } from "@/lib/http";
import { getServerSession, getSessionFromHeaders } from "@/lib/betterAuth";
import { consume, recordDecision, type BucketPolicy } from "@/lib/rateLimit";
import { recordAccess } from "@/lib/accessLog";
import { DASHBOARD_POLICY, PLANS } from "@/lib/plans";

/**
 * Resolve a user from a raw API key — with the key's id, which the access log
 * snapshots — or null if absent/unknown/revoked. Bumps `lastUsedAt`
 * best-effort so revocation and usage tracking work.
 */
export async function resolveUser(
  apiKey: string | null | undefined,
): Promise<{ user: User; keyId: string } | null> {
  if (!apiKey) return null;
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(apiKey) },
    include: { user: true },
  });
  if (!key || key.revokedAt) return null;
  // Fire-and-forget usage tracking — never fail the request over it.
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { user: key.user, keyId: key.id };
}

/** Resolve the user from a Better Auth session, given the session object. */
async function userFromSession(
  session: { user?: { id: string } } | null,
): Promise<User | null> {
  if (!session?.user) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}

/**
 * Dual auth, nullable: resolve the caller from a valid `X-API-Key`
 * (programmatic clients) OR a Better Auth web session cookie (dashboard).
 * Reads the session from `req.headers` so it works in tests too. Returns null
 * when neither is present/valid.
 *
 * This is where the access log learns its actor and credential: a resolved
 * identity is recorded here, once, whichever guard asked for it. A request
 * that resolves nobody records nothing and stays `none`.
 */
export async function resolveRequestUser(req: Request): Promise<User | null> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const resolved = await resolveUser(apiKey);
    if (!resolved) return null;
    recordAccess(req, {
      credential: "api_key",
      actorUserId: resolved.user.id,
      apiKeyId: resolved.keyId,
    });
    return resolved.user;
  }
  const user = await userFromSession(await getSessionFromHeaders(req.headers));
  if (user) recordAccess(req, { credential: "session", actorUserId: user.id });
  return user;
}

/**
 * Dual auth for resource routes shared by external clients and the dashboard:
 * require either a valid `X-API-Key` or a web session cookie.
 */
export async function requireUser(req: Request): Promise<User> {
  const user = await resolveRequestUser(req);
  if (!user) throw new ApiError(401, "Authentication required");
  await meterApi(req, user);
  return user;
}

/**
 * Charge one token against the `user:<id>:api` bucket of `owner` — the account
 * whose quota the request spends, which is the caller on an authenticated
 * route and the document's owner on a public read (see `assertCanRead`). All
 * of a user's keys share the bucket. Rejects with `429` when it is empty.
 */
export async function meterApi(req: Request, owner: User): Promise<void> {
  await meter(req, `user:${owner.id}:api`, PLANS[owner.tier].policy);
}

/**
 * Charge one token against `key` and reject with `429` when the bucket is
 * empty. The decision is stashed so `withRateLimit` can stamp the
 * `X-RateLimit-*` headers onto the response.
 *
 * Fail-open: a limiter error can only happen after identity resolution has
 * already made a successful DB round trip, so failing closed would buy no
 * enforcement and could turn a blip into an outage. We log and let the request
 * through. Metering lives behind the identity checks rather than in the
 * nullable resolvers so a request that resolves no bucket is never billed.
 */
async function meter(
  req: Request,
  key: string,
  policy: BucketPolicy,
): Promise<void> {
  let decision;
  try {
    decision = await consume(key, policy);
  } catch (err) {
    console.error("Rate limiter unavailable; failing open:", err);
    return;
  }
  recordDecision(req, decision);
  if (!decision.allowed) throw new ApiError(429, "API rate limit exceeded");
}

/**
 * Require a logged-in web session (cookie only). For account/key management.
 * Pass the `Request` from a route handler; omit it in Server Components to
 * read the ambient request cookies.
 *
 * Route-handler calls are metered against `user:<id>:dashboard`: a flat,
 * non-tiered ceiling separate from the `:api` bucket `/pricing` sells, so a
 * runaway dashboard can neither exhaust the tier quota nor be a way to obtain
 * capacity it does not account for. Server Components have no response to
 * stamp and are not metered.
 */
export async function requireSessionUser(req?: Request): Promise<User> {
  const session = req
    ? await getSessionFromHeaders(req.headers)
    : await getServerSession();
  const user = await userFromSession(session);
  if (!user) throw new ApiError(401, "Authentication required");
  if (req) await meter(req, `user:${user.id}:dashboard`, DASHBOARD_POLICY);
  return user;
}
