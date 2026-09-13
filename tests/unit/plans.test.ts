import { describe, expect, it } from "vitest";
import { DASHBOARD_POLICY, PLANS, makePolicy, rateLimitFeature } from "@/lib/plans";

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

  it("rejects refillPerSecond <= 0 at construction (no non-finite Retry-After)", () => {
    expect(() => makePolicy(10, 0)).toThrow(/refillPerSecond/);
    expect(() => makePolicy(10, -1)).toThrow(/refillPerSecond/);
    expect(makePolicy(10, 1)).toEqual({ capacity: 10, refillPerSecond: 1 });
  });
});
