import { describe, expect, it } from "vitest";
import { fixedOffset, foldHeatmap } from "@/lib/usageHeatmap";

/**
 * The When heatmap's fold (#63): hourly UTC counts folded into a weekday ×
 * hour grid in the viewer's zone. The fold is pure and takes the localiser
 * explicitly, so it can be tested with a fixed offset here and handed the
 * browser's own zone on the page.
 */

// 2026-09-16 is a Wednesday.
const utc = (iso: string) => new Date(iso).getTime();

describe("foldHeatmap", () => {
  it("returns an all-zero 7 × 24 grid for no rows", () => {
    const grid = foldHeatmap([], fixedOffset(0));
    expect(grid).toHaveLength(7);
    expect(grid.every((row) => row.length === 24 && row.every((v) => v === 0))).toBe(true);
  });

  it("folds a UTC hour at 23:00 into the next weekday in a UTC+2 zone", () => {
    const rows = [{ hourUtc: utc("2026-09-16T23:00:00Z"), count: 5 }];
    // 23:00 UTC Wed = 01:00 Thu at UTC+2.
    expect(foldHeatmap(rows, fixedOffset(120))[4][1]).toBe(5);
    // Untouched under UTC: still Wed 23.
    const under = foldHeatmap(rows, fixedOffset(0));
    expect(under[3][23]).toBe(5);
    expect(under[4][1]).toBe(0);
  });

  it("sums the hours that land in the same local cell across weeks", () => {
    const rows = [
      { hourUtc: utc("2026-09-09T10:00:00Z"), count: 2 }, // Wed
      { hourUtc: utc("2026-09-16T10:00:00Z"), count: 3 }, // Wed, a week later
      { hourUtc: utc("2026-09-16T11:00:00Z"), count: 1 },
    ];
    const grid = foldHeatmap(rows, fixedOffset(0));
    expect(grid[3][10]).toBe(5);
    expect(grid[3][11]).toBe(1);
  });

  it("wraps a negative offset back past Sunday midnight into Saturday", () => {
    // 2026-09-13 is a Sunday; 02:00 UTC at UTC-3 is Saturday 23:00.
    const rows = [{ hourUtc: utc("2026-09-13T02:00:00Z"), count: 1 }];
    expect(foldHeatmap(rows, fixedOffset(-180))[6][23]).toBe(1);
  });
});
