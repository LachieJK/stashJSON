import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/prisma/generated/client";
import type { Decision } from "@/lib/rateLimit";

/**
 * Plan quotas (#61) with Prisma mocked so no database is touched:
 *
 *  - a create at the cap → 403 with the quota-exceeded `type` URI;
 *  - a create below the cap → 201;
 *  - a `null` cap never refuses, however many rows exist;
 *  - counting is by live rows (revoked keys don't count);
 *  - the helper is *soft*: only the create handlers call it.
 *
 * The same rules against a real Postgres (including that an over-cap account
 * can still read / update / delete) are in tests/integration/quotas.test.ts.
 */

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";

const consume = vi.fn<(key: string, policy: unknown) => Promise<Decision>>();
const getSessionFromHeaders = vi.fn<(h: Headers) => Promise<unknown>>();
const findUniqueUser = vi.fn<(args: unknown) => Promise<User | null>>();
const countWorkspaces = vi.fn<(args: unknown) => Promise<number>>();
const countDocuments = vi.fn<(args: unknown) => Promise<number>>();
const countApiKeys = vi.fn<(args: unknown) => Promise<number>>();
const createWorkspace = vi.fn<(args: unknown) => Promise<unknown>>();
const createDocument = vi.fn<(args: unknown) => Promise<unknown>>();
const createApiKey = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rateLimit")>();
  return { ...actual, consume };
});
vi.mock("@/lib/betterAuth", () => ({
  getSessionFromHeaders,
  getServerSession: vi.fn(async () => null),
}));
vi.mock("@/lib/accessLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/accessLog")>();
  // Keep the wrapper contract but never write a log row.
  return {
    ...actual,
    withAccessLog: (_pattern: string, handler: unknown) => handler,
    recordAccess: vi.fn(),
    recordOwnAccount: vi.fn(),
  };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: findUniqueUser,
      findUniqueOrThrow: async (args: unknown) => {
        const u = await findUniqueUser(args);
        if (!u) throw new Error("not found");
        return u;
      },
    },
    workspace: { count: countWorkspaces, create: createWorkspace },
    document: {
      count: countDocuments,
      create: createDocument,
      findUnique: vi.fn(async () => null),
    },
    apiKey: {
      count: countApiKeys,
      create: createApiKey,
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
  },
}));

const allowed: Decision = {
  allowed: true,
  limit: 60,
  remaining: 59,
  resetAt: new Date("2026-01-01T00:01:00.000Z"),
  retryAfterSeconds: 0,
  tokens: 59,
  at: new Date("2026-01-01T00:00:00.000Z"),
};

const userOn = (tier: User["tier"]) =>
  ({ id: "user-1", email: "u@stashjson.local", name: "U", tier }) as User;

const sessionReq = (path: string, body: unknown) =>
  new Request(`http://test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "better-auth.session_token=abc",
    },
    body: JSON.stringify(body),
  });

const now = new Date("2026-01-01T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue(allowed);
  getSessionFromHeaders.mockResolvedValue({ user: { id: "user-1" } });
  countWorkspaces.mockResolvedValue(0);
  countDocuments.mockResolvedValue(0);
  countApiKeys.mockResolvedValue(0);
  createWorkspace.mockImplementation(async (args) => ({
    id: "ws-1",
    createdAt: now,
    updatedAt: now,
    ...(args as { data: object }).data,
  }));
  createDocument.mockImplementation(async (args) => ({
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(args as { data: object }).data,
  }));
  createApiKey.mockImplementation(async (args) => ({
    id: "key-1",
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
    ...(args as { data: object }).data,
  }));
});

describe("assertWithinQuota", () => {
  it("refuses at the cap with a 403 carrying the quota-exceeded type", async () => {
    const { assertWithinQuota, QUOTA_ERROR_TYPE } = await import("@/lib/quotas");
    const { ApiError } = await import("@/lib/http");
    findUniqueUser.mockResolvedValue(userOn("FREE"));
    countWorkspaces.mockResolvedValue(1);

    const err = await assertWithinQuota(userOn("FREE"), "workspaces").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.type).toBe(QUOTA_ERROR_TYPE);
    expect(err.type).toBe("https://stashjson.com/docs/errors/quota-exceeded");
    expect(err.message).toMatch(/Free plan allows 1 workspace$/);
  });

  it("allows below the cap and never queries for a null cap", async () => {
    const { assertWithinQuota } = await import("@/lib/quotas");
    countDocuments.mockResolvedValue(999);
    await expect(assertWithinQuota(userOn("FREE"), "documents")).resolves.toBeUndefined();

    countDocuments.mockResolvedValue(10_000_000);
    await expect(assertWithinQuota(userOn("TEAM"), "documents")).resolves.toBeUndefined();
    // TEAM is unlimited: no count is even taken.
    expect(countDocuments).toHaveBeenCalledTimes(1);
  });

  it("counts only unrevoked API keys", async () => {
    const { assertWithinQuota } = await import("@/lib/quotas");
    await assertWithinQuota(userOn("FREE"), "apiKeys");
    expect(countApiKeys).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
    });
  });

  it("pluralises the detail from the cap", async () => {
    const { assertWithinQuota } = await import("@/lib/quotas");
    countApiKeys.mockResolvedValue(10);
    await expect(assertWithinQuota(userOn("PRO"), "apiKeys")).rejects.toThrow(
      /Pro plan allows 10 API keys$/,
    );
  });
});

describe("the create handlers", () => {
  const expectQuotaRefusal = async (res: Response) => {
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      detail: expect.stringMatching(/^Plan quota exceeded/),
      type: "https://stashjson.com/docs/errors/quota-exceeded",
    });
  };

  it("POST /api/workspaces: 403 at cap, 201 below it", async () => {
    const { POST } = await import("@/app/api/workspaces/route");
    findUniqueUser.mockResolvedValue(userOn("FREE"));

    countWorkspaces.mockResolvedValue(1);
    await expectQuotaRefusal(await POST(sessionReq("/api/workspaces", { name: "x" })));
    expect(createWorkspace).not.toHaveBeenCalled();

    countWorkspaces.mockResolvedValue(0);
    const ok = await POST(sessionReq("/api/workspaces", { name: "x" }));
    expect(ok.status).toBe(201);
    expect(createWorkspace).toHaveBeenCalledTimes(1);
  });

  it("POST /api/documents: 403 at cap (regardless of workspace), 201 below it", async () => {
    const { POST } = await import("@/app/api/documents/route");
    findUniqueUser.mockResolvedValue(userOn("FREE"));

    countDocuments.mockResolvedValue(1_000);
    await expectQuotaRefusal(
      await POST(sessionReq("/api/documents", { json_data: { a: 1 } })),
    );
    expect(countDocuments).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(createDocument).not.toHaveBeenCalled();

    countDocuments.mockResolvedValue(999);
    const ok = await POST(sessionReq("/api/documents", { json_data: { a: 1 } }));
    expect(ok.status).toBe(201);
  });

  it("POST /api/keys: 403 at cap, 201 below it", async () => {
    const { POST } = await import("@/app/api/keys/route");
    findUniqueUser.mockResolvedValue(userOn("FREE"));

    countApiKeys.mockResolvedValue(1);
    await expectQuotaRefusal(await POST(sessionReq("/api/keys", { name: "ci" })));
    expect(createApiKey).not.toHaveBeenCalled();

    countApiKeys.mockResolvedValue(0);
    const ok = await POST(sessionReq("/api/keys", { name: "ci" }));
    expect(ok.status).toBe(201);
  });

  it("TEAM's null caps never refuse", async () => {
    const { POST } = await import("@/app/api/workspaces/route");
    findUniqueUser.mockResolvedValue(userOn("TEAM"));
    countWorkspaces.mockResolvedValue(1_000_000);
    const res = await POST(sessionReq("/api/workspaces", { name: "x" }));
    expect(res.status).toBe(201);
    expect(countWorkspaces).not.toHaveBeenCalled();
  });
});
