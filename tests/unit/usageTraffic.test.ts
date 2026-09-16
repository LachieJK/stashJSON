import { describe, expect, it } from "vitest";

/**
 * The Usage page's traffic aggregates (#62), pure part: the bucket grid a
 * range resolves to. The SQL-backed loaders — bucketing, status classing,
 * the warnings — are covered in tests/integration/usage.test.ts.
 */

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";

describe("bucketGrid", () => {
  const now = new Date("2026-09-16T10:07:30Z");

  it("uses 5m / 1h / 6h / 1d buckets that tile the range exactly", async () => {
    const { bucketGrid } = await import("@/lib/usage");
    expect(bucketGrid("1h", now)).toMatchObject({ widthMs: 5 * 60_000, count: 12 });
    expect(bucketGrid("24h", now)).toMatchObject({ widthMs: 3_600_000, count: 24 });
    expect(bucketGrid("7d", now)).toMatchObject({ widthMs: 6 * 3_600_000, count: 28 });
    expect(bucketGrid("30d", now)).toMatchObject({ widthMs: 86_400_000, count: 30 });
  });

  it("starts exactly one range before now, so the last bucket ends at now", async () => {
    const { bucketGrid } = await import("@/lib/usage");
    const g = bucketGrid("24h", now);
    expect(g.start.toISOString()).toBe("2026-09-15T10:07:30.000Z");
    expect(g.start.getTime() + g.widthMs * g.count).toBe(now.getTime());
  });
});
