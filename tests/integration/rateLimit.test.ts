import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DB-backed rate-limiter tests.
 *
 * OFF by default, same contract as routes.test.ts: they run only against a
 * throwaway Postgres named by TEST_DATABASE_URL, never the live Neon host.
 *
 * The clock is injected as a statement parameter — `consume(key, policy, at?)` —
 * so time-dependent behaviour is exact without fake timers or real short
 * windows. Nothing in `app/` ever passes `at`.
 */

const testDbUrl = process.env.TEST_DATABASE_URL;
const PROD_MARKERS = ["neon.tech"];
const looksProd = !!testDbUrl && PROD_MARKERS.some((m) => testDbUrl.includes(m));
const enabled = !!testDbUrl && !looksProd;

if (!enabled) {
  // eslint-disable-next-line no-console
  console.info(
    "[integration] Skipping rate-limit tests: set TEST_DATABASE_URL to a " +
      "throwaway (non-Neon) Postgres to enable them.",
  );
}

if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

const jsonHeaders = (apiKey?: string) => ({
  "content-type": "application/json",
  ...(apiKey ? { "x-api-key": apiKey } : {}),
});

describe.skipIf(!enabled)("rate limiter (DB-backed)", () => {
  let prisma: import("@/prisma/generated/client").PrismaClient;
  let consume: typeof import("@/lib/rateLimit").consume;
  let RATE_LIMIT_ERROR_TYPE: string;
  const createdUserIds: string[] = [];

  // Two of these tests need a backing store that serves concurrent raw queries
  // (`$queryRawUnsafe`) reliably: the concurrency guard fans out many consume()
  // calls at once, and the HTTP path runs a raw consume() right after an
  // unawaited pooled write (resolveUser's fire-and-forget lastUsedAt bump). A
  // real Postgres serves both; the sandbox's pglite-socket spuriously drops
  // connections under that load (only raw queries surface it — Prisma's model
  // queries silently retry). Probe for it so these tests run on CI's Postgres
  // and skip — rather than falsely fail — on pglite-socket.
  let rawConcurrencyCapable = false;

  // A unique bucket key per test, so tests never contend on one row.
  let seq = 0;
  const freshKey = () => `test:rl:${Date.now()}:${seq++}`;

  const tokensOf = async (key: string): Promise<number | undefined> => {
    const rows = await prisma.$queryRawUnsafe<{ tokens: number }[]>(
      "SELECT tokens FROM rate_limit_bucket WHERE key = $1",
      key,
    );
    return rows[0]?.tokens;
  };

  async function newUserKey(email?: string): Promise<string> {
    const { randomUUID } = await import("node:crypto");
    const { issueApiKey } = await import("@/lib/apiKeys");
    const user = await prisma.user.create({
      data: {
        name: "Rate-limit user",
        email: email ?? `rl_${randomUUID()}@stashjson.local`,
      },
    });
    createdUserIds.push(user.id);
    const { raw } = await issueApiKey(user.id, "Default key");
    return raw;
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
    const rl = await import("@/lib/rateLimit");
    consume = rl.consume;
    RATE_LIMIT_ERROR_TYPE = rl.RATE_LIMIT_ERROR_TYPE;

    // Identify the backing store with one sequential query — `version()` reports
    // a wasm/Emscripten build only for pglite, never a real Postgres. A probe
    // that actually exercised concurrency would itself drop connections and
    // poison the pool for the sequential tests, so detect rather than exercise.
    const rows = await prisma.$queryRawUnsafe<{ version: string }[]>(
      "SELECT version() AS version",
    );
    rawConcurrencyCapable = !/wasm|emscripten/i.test(rows[0]?.version ?? "");
    if (!rawConcurrencyCapable) {
      // eslint-disable-next-line no-console
      console.info(
        "[integration] Backing store is pglite-socket, which drops raw queries " +
          "under concurrency; skipping the concurrency-guard and HTTP wire tests. " +
          "They run against a real Postgres.",
      );
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  describe("consume() semantics", () => {
    it("refills continuously and lazily against the injected clock", async () => {
      const key = freshKey();
      const policy = { capacity: 10, refillPerSecond: 1 };
      const t0 = new Date("2026-01-01T00:00:00.000Z");

      // Drain the full burst at one instant.
      for (let i = 0; i < 10; i++) {
        const d = await consume(key, policy, t0);
        expect(d.allowed).toBe(true);
      }
      // Empty now: nothing refilled at the same instant.
      expect((await consume(key, policy, t0)).allowed).toBe(false);

      // Half a second later, still under one token — lazy, not bursty.
      const half = new Date(t0.getTime() + 500);
      expect((await consume(key, policy, half)).allowed).toBe(false);

      // Three seconds after t0: three tokens accrued, one spent, two remain.
      const t3 = new Date(t0.getTime() + 3000);
      const d = await consume(key, policy, t3);
      expect(d.allowed).toBe(true);
      expect(d.remaining).toBe(2);
    });

    it("caps the burst at capacity no matter how long it was idle", async () => {
      const key = freshKey();
      const policy = { capacity: 5, refillPerSecond: 1000 };
      const t0 = new Date("2026-01-01T00:00:00.000Z");

      // Seed the bucket, then idle a long time: refill would overflow but caps.
      await consume(key, policy, t0);
      const later = new Date(t0.getTime() + 100_000);

      let allowed = 0;
      for (let i = 0; i < 20; i++) {
        if ((await consume(key, policy, later)).allowed) allowed++;
      }
      // From full (capacity 5) at `later`, exactly 5 of the 20 succeed.
      expect(allowed).toBe(5);
    });

    it("spends no token on a rejection (no penalty box)", async () => {
      const key = freshKey();
      const policy = { capacity: 2, refillPerSecond: 1 };
      const t0 = new Date("2026-01-01T00:00:00.000Z");

      await consume(key, policy, t0);
      await consume(key, policy, t0); // bucket now empty
      const before = await tokensOf(key);
      const denied = await consume(key, policy, t0);
      expect(denied.allowed).toBe(false);
      const after = await tokensOf(key);
      expect(after).toBe(before); // untouched across the 429
      expect(after).toBeGreaterThanOrEqual(0);
    });

    it("reports a Retry-After that exactly predicts the next grant", async () => {
      const key = freshKey();
      const policy = { capacity: 1, refillPerSecond: 0.5 }; // one token / 2s
      const t0 = new Date("2026-01-01T00:00:00.000Z");

      await consume(key, policy, t0); // tokens -> 0
      const denied = await consume(key, policy, t0);
      expect(denied.allowed).toBe(false);
      expect(denied.retryAfterSeconds).toBe(2);

      // Just before the boundary: still denied. Exactly at it: granted.
      expect(
        (await consume(key, policy, new Date(t0.getTime() + 1999))).allowed,
      ).toBe(false);
      expect(
        (await consume(key, policy, new Date(t0.getTime() + 2000))).allowed,
      ).toBe(true);
    });
  });

  // Guard test (#43): the lock-free upsert serialises on one key. refill 0 makes
  // the assertion exact — exactly `capacity` grants, balance exactly 0, no
  // errors. Fewer means a lost grant; more means a double-spend.
  describe("concurrency guard", () => {
    it("grants exactly capacity under concurrent consumers of one key", async (ctx) => {
      if (!rawConcurrencyCapable) return ctx.skip();
      const key = freshKey();
      const CAPACITY = 50;
      const policy = { capacity: CAPACITY, refillPerSecond: 0 };
      const WORKERS = 16;
      const EACH = 20; // 320 attempts at one key

      let allowed = 0;
      let errors = 0;
      await Promise.all(
        Array.from({ length: WORKERS }, async () => {
          for (let i = 0; i < EACH; i++) {
            try {
              if ((await consume(key, policy)).allowed) allowed++;
            } catch {
              errors++;
            }
          }
        }),
      );

      expect(errors).toBe(0);
      expect(allowed).toBe(CAPACITY);
      expect(Math.abs((await tokensOf(key)) ?? NaN)).toBeLessThan(1e-9);
    });
  });

  // Guard tests (#43): the storage constraints are invisible to every other
  // test, so they are asserted directly against the migrated database.
  describe("storage constraints", () => {
    it("carries the hand-appended reloptions", async () => {
      const rows = await prisma.$queryRawUnsafe<{ reloptions: string | null }[]>(
        "SELECT array_to_string(reloptions, ',') AS reloptions " +
          "FROM pg_class WHERE relname = 'rate_limit_bucket'",
      );
      const reloptions = rows[0]?.reloptions ?? "";
      expect(reloptions).toContain("fillfactor=70");
      expect(reloptions).toContain("autovacuum_vacuum_scale_factor=0.01");
      expect(reloptions).toContain("autovacuum_vacuum_threshold=50");
    });

    it("indexes the key column only (one index, the primary key)", async () => {
      const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'rate_limit_bucket'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexname).toBe("rate_limit_bucket_pkey");
    });
  });

  describe("wire contract (HTTP)", () => {
    it("60 × 2xx then a 429 with the full contract on POST /api/documents", async (ctx) => {
      if (!rawConcurrencyCapable) return ctx.skip();
      const key = await newUserKey("wire@rl.local"); // FREE: capacity 60 / 1 rps
      const { POST } = await import("@/app/api/documents/route");

      const fire = () =>
        POST(
          new Request("http://test/api/documents", {
            method: "POST",
            headers: jsonHeaders(key),
            body: JSON.stringify({ json_data: { a: 1 } }),
          }),
        );

      let allowed = 0;
      let firstOk: Response | undefined;
      let rejected: Response | undefined;
      for (let i = 0; i < 61; i++) {
        const res = await fire();
        if (res.status === 201) {
          allowed++;
          firstOk ??= res;
        } else {
          rejected = res;
        }
      }

      // Exactly the plan's capacity succeeds; the 61st is refused.
      expect(allowed).toBe(60);
      expect(rejected).toBeDefined();
      expect(rejected!.status).toBe(429);

      // Headers on a success, too.
      expect(firstOk!.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(firstOk!.headers.get("Cache-Control")).toBe("private, no-store");
      expect(Number(firstOk!.headers.get("X-RateLimit-Remaining"))).toBe(59);

      // The 429 body and headers.
      expect(rejected!.headers.get("X-RateLimit-Remaining")).toBe("0");
      const retryAfter = rejected!.headers.get("Retry-After");
      expect(retryAfter).toMatch(/^\d+$/); // delta-seconds integer
      const body = (await rejected!.json()) as { detail: string; type: string };
      expect(body).toEqual({
        detail: expect.any(String),
        type: RATE_LIMIT_ERROR_TYPE,
      });
    });

    it("consumes a token on a 400 and a 404 (rejection is covered above)", async (ctx) => {
      if (!rawConcurrencyCapable) return ctx.skip();
      const key = await newUserKey("consumes@rl.local");
      const docs = await import("@/app/api/documents/route");
      const wsById = await import("@/app/api/workspaces/[id]/route");

      const remainingAfter = (res: Response) =>
        Number(res.headers.get("X-RateLimit-Remaining"));

      // A 400: bad body. requireUser meters before parseBody fails.
      const bad = await docs.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: "not json",
        }),
      );
      expect(bad.status).toBe(400);
      const r400 = remainingAfter(bad);

      // A 404: unknown workspace. requireUser meters before the 404.
      const missing = await wsById.GET(
        new Request("http://test/api/workspaces/does-not-exist", {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: "does-not-exist" }) },
      );
      expect(missing.status).toBe(404);
      const r404 = remainingAfter(missing);

      // Each error still spent a token.
      expect(r404).toBe(r400 - 1);
    });
  });
});
