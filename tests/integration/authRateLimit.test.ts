import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DB-backed tests for Better Auth's own limiter on /api/auth/**.
 *
 * OFF by default, same contract as routes.test.ts: they run only against a
 * throwaway Postgres named by TEST_DATABASE_URL, never the live Neon host.
 *
 * The app's `auth` instance has the limiter disabled under Vitest, so these
 * build a second instance from the same exported config with `enabled: true`
 * and a known trusted proxy, then drive `auth.handler` with raw Requests. That
 * exercises the real pieces — IP resolution through a forwarded chain, the
 * per-path rules, and the `auth_rate_limits` table — not a mock of them.
 */

const testDbUrl = process.env.TEST_DATABASE_URL;
const PROD_MARKERS = ["neon.tech"];
const looksProd = !!testDbUrl && PROD_MARKERS.some((m) => testDbUrl.includes(m));
const enabled = !!testDbUrl && !looksProd;

if (!enabled) {
  // eslint-disable-next-line no-console
  console.info(
    "[integration] Skipping Better Auth rate-limit tests: set TEST_DATABASE_URL " +
      "to a throwaway (non-Neon) Postgres to enable them.",
  );
}

if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

const BASE = "http://localhost:3000";
const PROXY = "10.0.0.1";

describe.skipIf(!enabled)("Better Auth rate limiter (DB-backed)", () => {
  let prisma: import("@/prisma/generated/client").PrismaClient;
  let handler: (req: Request) => Promise<Response>;
  const clientIps: string[] = [];

  // A fresh client IP per test so tests never share a bucket, and so leftover
  // rows from an earlier run cannot pre-fill one.
  const freshClientIp = () => {
    const ip = `203.0.113.${clientIps.length + 1}`;
    clientIps.push(ip);
    return ip;
  };

  // The request as a multi-hop proxy would deliver it: client first, then the
  // proxy that appended itself — the exact shape that collapsed every caller
  // onto one bucket before trustedProxies was set.
  const signIn = (clientIp: string) =>
    handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `${clientIp}, ${PROXY}`,
        },
        body: JSON.stringify({
          email: "nobody@stashjson.local",
          password: "not-the-password",
        }),
      }),
    );

  const rowFor = (clientIp: string, path: string) =>
    prisma.authRateLimit.findUnique({ where: { key: `${clientIp}|${path}` } });

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
    const { betterAuth } = await import("better-auth");
    const { prismaAdapter } = await import("better-auth/adapters/prisma");
    const { authIpAddress, authRateLimit } = await import("@/lib/betterAuth");
    const { env } = await import("@/lib/env");

    const auth = betterAuth({
      database: prismaAdapter(prisma, { provider: "postgresql" }),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      emailAndPassword: { enabled: true },
      advanced: {
        ipAddress: { ...authIpAddress, trustedProxies: ["10.0.0.0/8"] },
      },
      rateLimit: { ...authRateLimit, enabled: true },
    });
    handler = auth.handler;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (clientIps.length) {
      await prisma.authRateLimit.deleteMany({
        where: { OR: clientIps.map((ip) => ({ key: { startsWith: `${ip}|` } })) },
      });
    }
    await prisma.$disconnect();
  });

  it("rejects the sixth sign-in attempt in a minute from one client with 429", async () => {
    const ip = freshClientIp();

    for (let i = 0; i < 5; i++) {
      const res = await signIn(ip);
      // Bad credentials, but under the limit: whatever the endpoint says, it is
      // the endpoint speaking, not the limiter.
      expect(res.status).not.toBe(429);
    }

    const rejected = await signIn(ip);
    expect(rejected.status).toBe(429);
    // Better Auth's own dialect, accepted as-is in #41: `{ message }` and a
    // non-standard `X-Retry-After` in delta-seconds.
    const retryAfter = Number(rejected.headers.get("x-retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    await expect(rejected.json()).resolves.toMatchObject({
      message: expect.any(String),
    });
  });

  it("keys the bucket on the client behind the trusted proxy, not the proxy", async () => {
    const first = freshClientIp();
    const second = freshClientIp();

    for (let i = 0; i < 5; i++) await signIn(first);
    expect((await signIn(first)).status).toBe(429);

    // A different client through the same proxy hop has its own bucket. Before
    // trustedProxies, both resolved to no IP and shared `no-trusted-ip|path`.
    expect((await signIn(second)).status).not.toBe(429);

    // And the proxy itself never becomes the key.
    expect(await rowFor(PROXY, "/sign-in/email")).toBeNull();
  });

  it("persists the counter in auth_rate_limits rather than process memory", async () => {
    const ip = freshClientIp();
    for (let i = 0; i < 3; i++) await signIn(ip);

    const row = await rowFor(ip, "/sign-in/email");
    expect(row).not.toBeNull();
    expect(row!.count).toBe(3);
    // Epoch milliseconds, so a window comparison is arithmetic on one column.
    expect(Number(row!.lastRequest)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("does not meter /get-session at all", async () => {
    const ip = freshClientIp();

    for (let i = 0; i < 10; i++) {
      const res = await handler(
        new Request(`${BASE}/api/auth/get-session`, {
          headers: { "x-forwarded-for": `${ip}, ${PROXY}` },
        }),
      );
      expect(res.status).not.toBe(429);
    }

    // Exempt means no round trips were spent on it, not merely a high ceiling.
    expect(await rowFor(ip, "/get-session")).toBeNull();
  });
});
