import { describe, expect, it } from "vitest";
import {
  DASHBOARD_POLICY,
  PLANS,
  makePolicy,
  quotaFeature,
  rateLimitFeature,
} from "@/lib/plans";

describe("plan policies", () => {
  it("keys PLANS by the PlanTier enum so PLANS[tier] is total", () => {
    expect(Object.keys(PLANS).sort()).toEqual(["FREE", "PRO", "TEAM"]);
    for (const tier of ["FREE", "PRO", "TEAM"] as const) {
      expect(PLANS[tier].policy.refillPerSecond).toBeGreaterThan(0);
      // capacity is one minute's worth of the sustained rate.
      expect(PLANS[tier].policy.capacity).toBe(
        PLANS[tier].policy.refillPerSecond * 60,
      );
    }
  });

  it("carries the placeholder rates (60 / 600 / 6,000 per minute)", () => {
    expect(PLANS.FREE.policy.capacity).toBe(60);
    expect(PLANS.PRO.policy.capacity).toBe(600);
    expect(PLANS.TEAM.policy.capacity).toBe(6000);
  });

  it("derives each tier's /pricing rate bullet from refillPerSecond", () => {
    for (const tier of ["FREE", "PRO", "TEAM"] as const) {
      const { features, policy } = PLANS[tier];
      // Exactly one rate bullet, and it is the derived one — a hand-typed
      // "N requests / minute" alongside it would be the drift this forbids.
      expect(features.filter((f) => /requests \/ minute/i.test(f))).toEqual([
        rateLimitFeature(policy),
      ]);
      expect(features).toContain(
        `${(policy.refillPerSecond * 60).toLocaleString("en-US")} requests / minute, shared across your API keys`,
      );
    }
  });

  it("markets the sustained rate, never the burst capacity", () => {
    expect(rateLimitFeature(makePolicy(600, 10))).toBe(
      "600 requests / minute, shared across your API keys",
    );
    expect(rateLimitFeature(makePolicy(6000, 100))).toBe(
      "6,000 requests / minute, shared across your API keys",
    );
    // A burst ceiling far above the sustained rate leaves the bullet unchanged.
    expect(rateLimitFeature(makePolicy(999999, 1))).toBe(
      "60 requests / minute, shared across your API keys",
    );
    for (const plan of Object.values(PLANS)) {
      expect(plan.features.join("\n")).not.toMatch(/burst/i);
    }
  });

  it("exposes a separate flat dashboard policy", () => {
    expect(DASHBOARD_POLICY.refillPerSecond).toBeGreaterThan(0);
  });

  it("carries the quotas (FREE 1 / 1,000 / 1; PRO 10 / 100,000 / 10; TEAM unlimited)", () => {
    expect(PLANS.FREE.quotas).toEqual({ workspaces: 1, documents: 1_000, apiKeys: 1 });
    expect(PLANS.PRO.quotas).toEqual({ workspaces: 10, documents: 100_000, apiKeys: 10 });
    expect(PLANS.TEAM.quotas).toEqual({ workspaces: null, documents: null, apiKeys: null });
  });

  it("derives each tier's three count bullets from the quota record", () => {
    for (const tier of ["FREE", "PRO", "TEAM"] as const) {
      const { features, quotas } = PLANS[tier];
      // Exactly one bullet per countable resource, each the derived one — a
      // hand-typed "N workspaces" beside it would be the drift this forbids.
      const bullet = (noun: string) =>
        new RegExp(`^(Unlimited|[\\d,]+) ${noun}$`);
      expect(features.filter((f) => bullet("workspaces?").test(f))).toEqual([
        quotaFeature("workspaces", quotas.workspaces),
      ]);
      expect(features.filter((f) => bullet("documents?").test(f))).toEqual([
        quotaFeature("documents", quotas.documents),
      ]);
      expect(features.filter((f) => bullet("API keys?").test(f))).toEqual([
        quotaFeature("apiKeys", quotas.apiKeys),
      ]);
    }
    expect(PLANS.FREE.features).toEqual(
      expect.arrayContaining(["1 workspace", "1,000 documents", "1 API key"]),
    );
    expect(PLANS.PRO.features).toEqual(
      expect.arrayContaining(["10 workspaces", "100,000 documents", "10 API keys"]),
    );
    expect(PLANS.TEAM.features).toEqual(
      expect.arrayContaining([
        "Unlimited workspaces",
        "Unlimited documents",
        "Unlimited API keys",
      ]),
    );
  });

  it("formats a quota bullet with number grouping and singular/plural", () => {
    expect(quotaFeature("workspaces", 1)).toBe("1 workspace");
    expect(quotaFeature("documents", 100_000)).toBe("100,000 documents");
    expect(quotaFeature("apiKeys", null)).toBe("Unlimited API keys");
  });

  it("rejects refillPerSecond <= 0 at construction (no non-finite Retry-After)", () => {
    expect(() => makePolicy(10, 0)).toThrow(/refillPerSecond/);
    expect(() => makePolicy(10, -1)).toThrow(/refillPerSecond/);
    expect(makePolicy(10, 1)).toEqual({ capacity: 10, refillPerSecond: 1 });
  });
});
