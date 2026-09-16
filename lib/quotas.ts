import type { User } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { PLANS, quotaFeature, type QuotaResource } from "@/lib/plans";

/**
 * Quota enforcement — the create-time half of a plan (the other half is the
 * rate limiter). A quota is a *soft cap*: it is checked here, at create, and
 * nowhere else, so an account that finds itself over cap (after a downgrade)
 * keeps everything it has and is refused only new creates. Reads, updates and
 * deletes never consult this file.
 */

/** The RFC 9457 problem-type URI for a quota rejection; the docs anchor. */
export const QUOTA_ERROR_TYPE =
  "https://stashjson.com/docs/errors/quota-exceeded";

/**
 * How many of a resource the user currently holds — live rows, which is what
 * the cap is a cap on. Documents count regardless of workspace; API keys count
 * only while unrevoked, since a revoked key is gone from the user's point of
 * view even though its row stays for the access log.
 */
export async function countOwned(
  userId: string,
  resource: QuotaResource,
): Promise<number> {
  switch (resource) {
    case "workspaces":
      return prisma.workspace.count({ where: { userId } });
    case "documents":
      return prisma.document.count({ where: { userId } });
    case "apiKeys":
      return prisma.apiKey.count({ where: { userId, revokedAt: null } });
  }
}

/**
 * Refuse a create that would take the user past their tier's cap. Call it in
 * the create handler after auth and before the insert; a `null` cap never
 * refuses. The `403` carries the `type` URI so a client can tell "over quota"
 * from the plain access-denied `403` on someone else's document.
 */
export async function assertWithinQuota(
  user: Pick<User, "id" | "tier">,
  resource: QuotaResource,
): Promise<void> {
  const cap = PLANS[user.tier].quotas[resource];
  if (cap === null) return;
  const used = await countOwned(user.id, resource);
  if (used < cap) return;
  throw new ApiError(
    403,
    `Plan quota exceeded: your ${PLANS[user.tier].name} plan allows ${quotaFeature(resource, cap)}`,
    { type: QUOTA_ERROR_TYPE },
  );
}
