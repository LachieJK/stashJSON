import { describe, expect, it } from "vitest";

/**
 * The Log's pagination cursor (#64), pure part: an opaque string that carries
 * `(at, id)` at the column's microsecond precision. The keyset query it
 * feeds is covered in tests/integration/usage.test.ts.
 */

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";

describe("log cursor", () => {
  it("round-trips `(at, id)` with microseconds intact", async () => {
    const { encodeCursor, decodeCursor } = await import("@/lib/usage");
    const cursor = { at: "2026-09-16T11:50:00.000123Z", id: "0b1c2d3e" };
    const raw = encodeCursor(cursor);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(raw)).toEqual(cursor);
  });

  it("rejects anything that is not one of ours", async () => {
    const { encodeCursor, decodeCursor } = await import("@/lib/usage");
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("[]").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('{"at":1,"id":"x"}').toString("base64url"))).toBeNull();
    // Millisecond precision is not enough to resume from — see `encodeCursor`.
    expect(decodeCursor(encodeCursor({ at: "2026-09-16T11:50:00.000Z", id: "x" }))).toBeNull();
    // A timestamp is not a SQL fragment; the shape check keeps it a literal.
    expect(decodeCursor(encodeCursor({ at: "now()", id: "x" }))).toBeNull();
  });
});

describe("statusClassOf", () => {
  it("classes a single status the way the SQL aggregates do", async () => {
    const { statusClassOf } = await import("@/lib/statusClass");
    expect(statusClassOf(200)).toBe("2xx");
    expect(statusClassOf(304)).toBe("2xx");
    expect(statusClassOf(404)).toBe("4xx");
    expect(statusClassOf(429)).toBe("429");
    expect(statusClassOf(500)).toBe("5xx");
  });
});

describe("ago", () => {
  it("rounds to the largest unit that fits, relative to the given now", async () => {
    const { ago } = await import("@/app/(dashboard)/usage/format");
    const now = Date.UTC(2026, 8, 16, 12, 0, 0);
    expect(ago(now - 12_000, now)).toBe("12s ago");
    expect(ago(now - 3 * 60_000, now)).toBe("3m ago");
    expect(ago(now - 5 * 3_600_000, now)).toBe("5h ago");
    expect(ago(now - 2 * 86_400_000, now)).toBe("2d ago");
    expect(ago(now + 5_000, now)).toBe("0s ago");
  });
});
