import type { User } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";
import { PLANS, QUOTA_RESOURCES, type QuotaResource } from "@/lib/plans";
import { countOwned } from "@/lib/quotas";

/**
 * Everything the Usage page reads, server-side only (decision in #60: no
 * public usage API — the aggregates live here and are called from the page).
 * This slice ships the resource picker and the plan headroom; the access-log
 * aggregates (traffic, warnings, heatmap, actors) arrive in the next slices.
 * The URL filters are in `lib/usageFilters.ts`, kept free of `lib/db` so the
 * client-side controls can import them.
 */

// ---------------------------------------------------------------------------
// Resource picker options.

export type ResourceOptions = {
  workspaces: { id: string; name: string }[];
  /** `workspaceId` null = detached. Capped at `RESOURCE_PICKER_LIMIT`, newest first. */
  documents: { id: string; workspaceId: string | null }[];
};

/**
 * A `<select>` with every document of a 100,000-document account is not a
 * control, so the picker shows the most recently updated ones. A deep link
 * (`?resource=<id>` from a workspace page, next slice) still works for any id.
 */
export const RESOURCE_PICKER_LIMIT = 200;

export async function loadResourceOptions(userId: string): Promise<ResourceOptions> {
  const [workspaces, documents] = await Promise.all([
    prisma.workspace.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.document.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: RESOURCE_PICKER_LIMIT,
      select: { id: true, workspaceId: true },
    }),
  ]);
  return { workspaces, documents };
}

// ---------------------------------------------------------------------------
// Plan headroom.

export type QuotaUsage = {
  resource: QuotaResource;
  used: number;
  /** null = unlimited. */
  cap: number | null;
};

/**
 * `used / cap` for each quota, with `used` counted the same way
 * `assertWithinQuota` counts it — the meter and the refusal agree by
 * construction.
 */
export async function loadPlanUsage(
  user: Pick<User, "id" | "tier">,
): Promise<QuotaUsage[]> {
  const quotas = PLANS[user.tier].quotas;
  return Promise.all(
    QUOTA_RESOURCES.map(async (resource) => ({
      resource,
      used: await countOwned(user.id, resource),
      cap: quotas[resource],
    })),
  );
}
