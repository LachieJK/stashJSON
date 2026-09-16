import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/prisma/generated/client";

/**
 * The Usage page's pure pieces (#61): URL filter parsing, the plan-headroom
 * loader, and the meter's fill thresholds. Prisma is mocked; rendering is not
 * exercised here (vitest runs in node).
 */

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";

const countWorkspaces = vi.fn<(args: unknown) => Promise<number>>();
const countDocuments = vi.fn<(args: unknown) => Promise<number>>();
const countApiKeys = vi.fn<(args: unknown) => Promise<number>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { count: countWorkspaces },
    document: { count: countDocuments },
    apiKey: { count: countApiKeys },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseUsageFilters", () => {
  it("defaults to 7d / all credentials / all resources", async () => {
    const { parseUsageFilters } = await import("@/lib/usageFilters");
    expect(parseUsageFilters({})).toEqual({ range: "7d", cred: "all", resource: null });
  });

  it("reads the three controls and ignores unknown values", async () => {
    const { parseUsageFilters } = await import("@/lib/usageFilters");
    expect(
      parseUsageFilters({ range: "1h", cred: "api_key", resource: "ws-1" }),
    ).toEqual({ range: "1h", cred: "api_key", resource: "ws-1" });
    expect(parseUsageFilters({ range: "90d", cred: "bogus", resource: "" })).toEqual({
      range: "7d",
      cred: "all",
      resource: null,
    });
    // Repeated keys take the first.
    expect(parseUsageFilters({ range: ["24h", "1h"] }).range).toBe("24h");
  });

  it("round-trips through usageQuery, omitting defaults", async () => {
    const { parseUsageFilters, usageQuery } = await import("@/lib/usageFilters");
    expect(usageQuery({ range: "7d", cred: "all", resource: null })).toBe("");
    const qs = usageQuery({ range: "30d", cred: "none", resource: "doc-1" });
    expect(qs).toBe("range=30d&cred=none&resource=doc-1");
    expect(parseUsageFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual({
      range: "30d",
      cred: "none",
      resource: "doc-1",
    });
  });
});

describe("loadPlanUsage", () => {
  const user = (tier: User["tier"]) => ({ id: "user-1", tier });

  it("pairs each live count with the tier's cap, in meter order", async () => {
    const { loadPlanUsage } = await import("@/lib/usage");
    countWorkspaces.mockResolvedValue(1);
    countDocuments.mockResolvedValue(812);
    countApiKeys.mockResolvedValue(0);
    await expect(loadPlanUsage(user("FREE"))).resolves.toEqual([
      { resource: "workspaces", used: 1, cap: 1 },
      { resource: "documents", used: 812, cap: 1_000 },
      { resource: "apiKeys", used: 0, cap: 1 },
    ]);
    expect(countApiKeys).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
    });
  });

  it("reports a null cap for an unlimited tier", async () => {
    const { loadPlanUsage } = await import("@/lib/usage");
    countWorkspaces.mockResolvedValue(42);
    countDocuments.mockResolvedValue(0);
    countApiKeys.mockResolvedValue(3);
    const usage = await loadPlanUsage(user("TEAM"));
    expect(usage.map((q) => q.cap)).toEqual([null, null, null]);
    expect(usage[0]).toEqual({ resource: "workspaces", used: 42, cap: null });
  });
});

describe("meterFillClass", () => {
  it("is ink below 80 %, warn from 80 %, danger at the cap", async () => {
    const { meterFillClass } = await import("@/app/(dashboard)/usage/Meter");
    expect(meterFillClass(0, 10)).toBe("bg-text");
    expect(meterFillClass(7, 10)).toBe("bg-text");
    expect(meterFillClass(8, 10)).toBe("bg-warn");
    expect(meterFillClass(9, 10)).toBe("bg-warn");
    expect(meterFillClass(10, 10)).toBe("bg-danger");
    // Over cap (after a downgrade) is still danger, not an error.
    expect(meterFillClass(12, 10)).toBe("bg-danger");
  });

  it("never colours an unlimited quota", async () => {
    const { meterFillClass } = await import("@/app/(dashboard)/usage/Meter");
    expect(meterFillClass(1_000_000, null)).toBe("bg-text");
  });
});
