import type { User } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/utils";
import { ApiError } from "@/lib/http";
import { getServerSession, getSessionFromHeaders } from "@/lib/betterAuth";

/**
 * Resolve a user from a raw API key, or null if absent/unknown/revoked.
 * Bumps `lastUsedAt` best-effort so revocation and usage tracking work.
 */
export async function resolveUser(
  apiKey: string | null | undefined,
): Promise<User | null> {
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
  return key.user;
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
 */
export async function resolveRequestUser(req: Request): Promise<User | null> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) return resolveUser(apiKey);
  return userFromSession(await getSessionFromHeaders(req.headers));
}

/**
 * Dual auth for resource routes shared by external clients and the dashboard:
 * require either a valid `X-API-Key` or a web session cookie.
 */
export async function requireUser(req: Request): Promise<User> {
  const user = await resolveRequestUser(req);
  if (!user) throw new ApiError(401, "Authentication required");
  return user;
}

/**
 * Require a logged-in web session (cookie only). For account/key management.
 * Pass `req.headers` from a route handler; omit it in Server Components to read
 * the ambient request cookies.
 */
export async function requireSessionUser(reqHeaders?: Headers): Promise<User> {
  const session = reqHeaders
    ? await getSessionFromHeaders(reqHeaders)
    : await getServerSession();
  const user = await userFromSession(session);
  if (!user) throw new ApiError(401, "Authentication required");
  return user;
}
