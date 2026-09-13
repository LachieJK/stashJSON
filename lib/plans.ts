// Static, intentionally inert plan catalog for the pricing page — no Stripe,
// env, or network. It is also the single source of each tier's rate-limit
// policy: `/pricing` derives its rate bullet from the policy the limiter
// enforces (see `rateLimitFeature`), so the two cannot advertise different
// numbers.

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
};

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
  const perMinute = (policy.refillPerSecond * 60).toLocaleString("en-US");
  return `${perMinute} requests / minute, shared across your API keys`;
}

// Each tier's `:api` policy, defined once so the feature list below can derive
// from it. Placeholders: 60 / 600 / 6,000 req/min.
const FREE_POLICY = makePolicy(60, 1);
const PRO_POLICY = makePolicy(600, 10);
const TEAM_POLICY = makePolicy(6000, 100);

// Keyed by the Prisma `PlanTier` enum so `PLANS[user.tier]` is a total lookup
// with no `undefined` branch.
export const PLANS: Record<PlanTier, Plan> = {
  FREE: {
    name: "Free",
    priceMonthly: 0,
    tagline: "Everything you need to start storing JSON.",
    ctaLabel: "Start for free",
    features: [
      "1 workspace",
      "1,000 documents",
      rateLimitFeature(FREE_POLICY),
      "7 days of version history",
      "1 API key",
      "Community support",
    ],
    policy: FREE_POLICY,
  },
  PRO: {
    name: "Pro",
    priceMonthly: 19,
    tagline: "For developers shipping real projects.",
    featured: true,
    ctaLabel: "Upgrade to Pro",
    features: [
      "10 workspaces",
      "100,000 documents",
      rateLimitFeature(PRO_POLICY),
      "90 days of version history",
      "10 API keys",
      "Email support",
    ],
    policy: PRO_POLICY,
  },
  TEAM: {
    name: "Team",
    priceMonthly: 99,
    tagline: "For teams that need scale and control.",
    ctaLabel: "Choose Team",
    features: [
      "Unlimited workspaces",
      "Unlimited documents",
      rateLimitFeature(TEAM_POLICY),
      "1 year of version history",
      "Unlimited API keys",
      "Priority support & SLA",
    ],
    policy: TEAM_POLICY,
  },
};

/**
 * The flat, non-tiered policy for the `user:<id>:dashboard` surface — a high
 * ceiling that is never advertised. Charged by `requireSessionUser`; defined
 * here so every policy lives in one file.
 */
export const DASHBOARD_POLICY: BucketPolicy = makePolicy(6000, 100);
