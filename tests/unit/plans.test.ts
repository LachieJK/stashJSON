import { describe, expect, it } from "vitest";
import { DASHBOARD_POLICY, PLANS, makePolicy } from "@/lib/plans";

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

  it("exposes a separate flat dashboard policy", () => {
    expect(DASHBOARD_POLICY.refillPerSecond).toBeGreaterThan(0);
  });

  it("rejects refillPerSecond <= 0 at construction (no non-finite Retry-After)", () => {
    expect(() => makePolicy(10, 0)).toThrow(/refillPerSecond/);
    expect(() => makePolicy(10, -1)).toThrow(/refillPerSecond/);
    expect(makePolicy(10, 1)).toEqual({ capacity: 10, refillPerSecond: 1 });
  });
});
