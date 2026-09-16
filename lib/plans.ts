// Static, intentionally inert plan catalog for the pricing page — no Stripe,
// env, or network. It is also the single source of each tier's two enforced
// halves: the rate-limit policy and the quotas. `/pricing` derives its rate
// bullet from the policy the limiter enforces (see `rateLimitFeature`) and its
// three count bullets from the quotas `assertWithinQuota` enforces (see
// `quotaFeature`), so the page cannot advertise a number the code does not.

import type { PlanTier } from "@/prisma/generated/enums";
import type { BucketPolicy } from "@/lib/rateLimit";

export type Plan = {
  name: string;
  /** Whole US dollars per month. 0 means free. */
  priceMonthly: number;
  tagline: string;
  features: string[];
  /** Visually highlight this plan as the recommended one. */
  featured?: boolean;
  ctaLabel: string;

  /** Stripe Price ID for the plan's recurring subscription; unset until billing is wired. */
  stripePriceId?: string;

  /**
   * The tier's `user:<id>:api` token-bucket policy. `refillPerSecond` is the
   * advertised sustained rate; `capacity` is one minute's worth, the burst
   * ceiling. `features` carries the rate as `rateLimitFeature(policy)`, never
   * as a typed string.
   */
  policy: BucketPolicy;

  /**
   * The tier's caps on countable resources — checked at create time only, see
   * `lib/quotas.ts`. `features` carries each as `quotaFeature(...)`, never as
   * a typed string.
   */
  quotas: Quotas;
};

/** The resources a plan caps. Keys double as the `assertWithinQuota` argument. */
export type QuotaResource = "workspaces" | "documents" | "apiKeys";

/** A cap per resource; `null` means unlimited. */
export type Quotas = Record<QuotaResource, number | null>;

/** Every quota-bearing resource, in the order the meters and docs list them. */
export const QUOTA_RESOURCES: readonly QuotaResource[] = [
  "workspaces",
  "documents",
  "apiKeys",
];

/**
 * A cap as text: "1,000", or `unlimited` (default "Unlimited") for `null`.
 * The one place the null/number split is spelled out, so the pricing bullet,
 * the 403 detail, the docs table and the Usage meters cannot disagree.
 */
export function formatCap(cap: number | null, unlimited = "Unlimited"): string {
  return cap === null ? unlimited : cap.toLocaleString("en-US");
}

/** Singular / plural labels for the `/pricing` bullets and the Usage meters. */
export const QUOTA_LABELS: Record<QuotaResource, { one: string; many: string }> =
  {
    workspaces: { one: "workspace", many: "workspaces" },
    documents: { one: "document", many: "documents" },
    apiKeys: { one: "API key", many: "API keys" },
  };

/**
 * The `/pricing` bullet for one quota, computed from the cap rather than typed
 * beside it: "1 workspace", "100,000 documents", "Unlimited API keys".
 */
export function quotaFeature(
  resource: QuotaResource,
  cap: number | null,
): string {
  const label = QUOTA_LABELS[resource];
  return `${formatCap(cap)} ${cap === 1 ? label.one : label.many}`;
}

/**
 * Build a policy, rejecting `refillPerSecond <= 0` at the one site where a
 * policy is constructed. A zero/negative rate would make `Retry-After`
 * non-finite, so forbidding it here makes that unrepresentable and removes any
 * need for an `isFinite` check downstream. (A never-refilling bucket is still
 * valid as a *bucket* — `consume()` accepts it — just not as a plan.)
 */
export function makePolicy(
  capacity: number,
  refillPerSecond: number,
): BucketPolicy {
  if (refillPerSecond <= 0) {
    throw new Error(
      `refillPerSecond must be > 0 (got ${refillPerSecond}): a plan's advertised rate must refill`,
    );
  }
  return { capacity, refillPerSecond };
}

/**
 * The `/pricing` bullet for a tier's rate, computed from the policy rather than
 * typed alongside it. "Shared across your API keys" is load-bearing: all of a
 * user's keys draw on one bucket with no per-key allowance, and a customer who
 * does not know that will read the number wrong. `capacity` (the burst
 * ceiling) is discoverable via `X-RateLimit-Limit` but not marketed — do not
 * add a burst bullet.
 */
export function rateLimitFeature(policy: BucketPolicy): string {
  const perMinute = ratePerMinute(policy).toLocaleString("en-US");
  return `${perMinute} requests / minute, shared across your API keys`;
}

/** The advertised sustained rate as the customer reads it: requests per minute. */
export function ratePerMinute(policy: BucketPolicy): number {
  return policy.refillPerSecond * 60;
}

// Each tier's `:api` policy, defined once so the feature list below can derive
// from it. Placeholders: 60 / 600 / 6,000 req/min.
const FREE_POLICY = makePolicy(60, 1);
const PRO_POLICY = makePolicy(600, 10);
const TEAM_POLICY = makePolicy(6000, 100);

// Each tier's quotas, defined once so the feature list below derives from them
// and `assertWithinQuota` enforces the same numbers.
const FREE_QUOTAS: Quotas = { workspaces: 1, documents: 1_000, apiKeys: 1 };
const PRO_QUOTAS: Quotas = { workspaces: 10, documents: 100_000, apiKeys: 10 };
const TEAM_QUOTAS: Quotas = { workspaces: null, documents: null, apiKeys: null };

// Keyed by the Prisma `PlanTier` enum so `PLANS[user.tier]` is a total lookup
// with no `undefined` branch.
export const PLANS: Record<PlanTier, Plan> = {
  FREE: {
    name: "Free",
    priceMonthly: 0,
    tagline: "Everything you need to start storing JSON.",
    ctaLabel: "Start for free",
    features: [
      quotaFeature("workspaces", FREE_QUOTAS.workspaces),
      quotaFeature("documents", FREE_QUOTAS.documents),
      rateLimitFeature(FREE_POLICY),
      "7 days of version history",
      quotaFeature("apiKeys", FREE_QUOTAS.apiKeys),
      "Community support",
    ],
    policy: FREE_POLICY,
    quotas: FREE_QUOTAS,
  },
  PRO: {
    name: "Pro",
    priceMonthly: 19,
    tagline: "For developers shipping real projects.",
    featured: true,
    ctaLabel: "Upgrade to Pro",
    features: [
      quotaFeature("workspaces", PRO_QUOTAS.workspaces),
      quotaFeature("documents", PRO_QUOTAS.documents),
      rateLimitFeature(PRO_POLICY),
      "90 days of version history",
      quotaFeature("apiKeys", PRO_QUOTAS.apiKeys),
      "Email support",
    ],
    policy: PRO_POLICY,
    quotas: PRO_QUOTAS,
  },
  TEAM: {
    name: "Team",
    priceMonthly: 99,
    tagline: "For teams that need scale and control.",
    ctaLabel: "Choose Team",
    features: [
      quotaFeature("workspaces", TEAM_QUOTAS.workspaces),
      quotaFeature("documents", TEAM_QUOTAS.documents),
      rateLimitFeature(TEAM_POLICY),
      "1 year of version history",
      quotaFeature("apiKeys", TEAM_QUOTAS.apiKeys),
      "Priority support & SLA",
    ],
    policy: TEAM_POLICY,
    quotas: TEAM_QUOTAS,
  },
};

/**
 * The flat, non-tiered policy for the `user:<id>:dashboard` surface — a high
 * ceiling that is never advertised. Charged by `requireSessionUser`; defined
 * here so every policy lives in one file.
 */
export const DASHBOARD_POLICY: BucketPolicy = makePolicy(6000, 100);
