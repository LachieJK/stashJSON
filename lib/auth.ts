import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/utils";
import { ApiError } from "@/lib/http";

/** Resolve a user from a raw API key, or null if absent/unknown. */
export async function resolveUser(
  apiKey: string | null | undefined,
): Promise<User | null> {
  if (!apiKey) return null;
  return prisma.user.findUnique({ where: { apiKeyHash: hashApiKey(apiKey) } });
}

/**
 * Require a valid API key from the `X-API-Key` header and return the user.
 * Replaces the `verify_api_key` FastAPI dependency (legacy/app/auth.py).
 */
export async function requireApiKey(req: Request): Promise<User> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) throw new ApiError(401, "API key is required");
  const user = await resolveUser(apiKey);
  if (!user) throw new ApiError(401, "Invalid API key");
  return user;
}
