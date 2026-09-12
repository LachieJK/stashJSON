import { beforeAll, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import type { Decision } from "@/lib/rateLimit";

// lib/rateLimit imports lib/db → lib/env, which requires DATABASE_URL to be a
// valid URL at import time. These tests never open a connection (withRateLimit
// only reads the recorded decision and rewrites headers/body), so a dummy URL
// satisfies env validation. Set it before the dynamic import below — a static
// `import` would be hoisted above any assignment and evaluate env first.
process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";

let RATE_LIMIT_ERROR_TYPE: string;
let recordDecision: typeof import("@/lib/rateLimit").recordDecision;
let withRateLimit: typeof import("@/lib/rateLimit").withRateLimit;

beforeAll(async () => {
  const rl = await import("@/lib/rateLimit");
  RATE_LIMIT_ERROR_TYPE = rl.RATE_LIMIT_ERROR_TYPE;
  recordDecision = rl.recordDecision;
  withRateLimit = rl.withRateLimit;
});

// resetAt 60s out so X-RateLimit-Reset is a stable epoch-seconds integer.
const decision = (over: Partial<Decision>): Decision => ({
  allowed: true,
  limit: 60,
  remaining: 59,
  resetAt: new Date("2026-01-01T00:01:00.000Z"),
  retryAfterSeconds: 0,
  tokens: 59,
  at: new Date("2026-01-01T00:00:00.000Z"),
  ...over,
});

describe("withRateLimit", () => {
  it("stamps the X-RateLimit trio and Cache-Control on an allowed response", async () => {
    const req = new Request("http://test/api/documents", { method: "POST" });
    const handler = withRateLimit(async (r: Request) => {
      recordDecision(r, decision({ allowed: true, remaining: 59 }));
      return NextResponse.json({ ok: true }, { status: 201 });
    });

    const res = await handler(req);
    expect(res.status).toBe(201);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    expect(res.headers.get("X-RateLimit-Reset")).toBe(
      String(Math.ceil(new Date("2026-01-01T00:01:00.000Z").getTime() / 1000)),
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    // Not rejected: no Retry-After, body untouched.
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rebuilds a rejection into 429 { detail, type } with Retry-After", async () => {
    const req = new Request("http://test/api/documents", { method: "POST" });
    // Mimics requireUser: record a rejected decision, then the 429 handle() emits.
    const handler = withRateLimit(async (r: Request) => {
      recordDecision(
        r,
        decision({ allowed: false, remaining: 0, retryAfterSeconds: 7 }),
      );
      return NextResponse.json(
        { detail: "API rate limit exceeded" },
        { status: 429 },
      );
    });

    const res = await handler(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("Retry-After")).toBe("7");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      detail: "API rate limit exceeded",
      type: RATE_LIMIT_ERROR_TYPE,
    });
  });

  it("passes a response through untouched when no decision was recorded", async () => {
    const req = new Request("http://test/api/health");
    const handler = withRateLimit(async () =>
      NextResponse.json({ status: "ok" }),
    );

    const res = await handler(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBeNull();
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
