import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/prisma/generated/client";
import type { Decision } from "@/lib/rateLimit";

/**
 * Which bucket a request is billed to — the routing rules of #47, with the
 * limiter and the identity resolvers mocked so no database is touched:
 *
 *  - a dashboard (session-cookie) request bills `:dashboard`, never `:api`;
 *  - an anonymous read of a public document bills the *owner's* `:api`;
 *  - a request that resolves no user bills nothing.
 *
 * The limiter's own arithmetic is covered against a real Postgres in
 * tests/integration/rateLimit.test.ts.
 */

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";

const consume = vi.fn<(key: string, policy: unknown) => Promise<Decision>>();
const getSessionFromHeaders = vi.fn<(h: Headers) => Promise<unknown>>();
const findUniqueUser = vi.fn<(args: unknown) => Promise<User | null>>();
const findUniqueApiKey = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rateLimit")>();
  return { ...actual, consume };
});
vi.mock("@/lib/betterAuth", () => ({
  getSessionFromHeaders,
  getServerSession: vi.fn(async () => null),
}));
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
    apiKey: {
      findUnique: findUniqueApiKey,
      // resolveUser's fire-and-forget lastUsedAt bump.
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

const owner = {
  id: "owner-1",
  email: "owner@stashjson.local",
  name: "Owner",
  tier: "FREE",
} as User;

const doc = (isPublic: boolean) =>
  ({
    id: "doc-1",
    userId: owner.id,
    workspaceId: null,
    jsonData: {},
    isPublic,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as import("@/prisma/generated/client").Document;

const keysBilled = () => consume.mock.calls.map(([key]) => key);

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue(allowed);
  findUniqueUser.mockResolvedValue(owner);
  findUniqueApiKey.mockResolvedValue(null);
  getSessionFromHeaders.mockResolvedValue(null);
});

describe("the :dashboard surface", () => {
  it("bills user:<id>:dashboard and not :api on a session request", async () => {
    const { requireSessionUser } = await import("@/lib/auth");
    const { DASHBOARD_POLICY } = await import("@/lib/plans");
    getSessionFromHeaders.mockResolvedValue({ user: { id: owner.id } });

    const req = new Request("http://test/api/keys", {
      headers: { cookie: "better-auth.session_token=abc" },
    });
    await expect(requireSessionUser(req)).resolves.toMatchObject({ id: owner.id });

    expect(keysBilled()).toEqual([`user:${owner.id}:dashboard`]);
    expect(consume).toHaveBeenCalledWith(
      `user:${owner.id}:dashboard`,
      DASHBOARD_POLICY,
    );
  });

  it("stamps the decision so withRateLimit reaches the wire", async () => {
    const { requireSessionUser } = await import("@/lib/auth");
    const { withRateLimit } = await import("@/lib/rateLimit");
    getSessionFromHeaders.mockResolvedValue({ user: { id: owner.id } });

    const handler = withRateLimit(async (r: Request) => {
      await requireSessionUser(r);
      return new Response("ok");
    });
    const res = await handler(new Request("http://test/api/keys"));
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
  });

  it("bills nothing when no session resolves", async () => {
    const { requireSessionUser } = await import("@/lib/auth");
    await expect(
      requireSessionUser(new Request("http://test/api/keys")),
    ).rejects.toMatchObject({ status: 401 });
    expect(consume).not.toHaveBeenCalled();
  });
});

describe("public-document reads", () => {
  it("bill the owner's :api bucket on an anonymous read", async () => {
    const { assertCanRead } = await import("@/lib/documents");
    const { PLANS } = await import("@/lib/plans");

    await expect(
      assertCanRead(new Request("http://test/api/documents/doc-1"), doc(true)),
    ).resolves.toBeUndefined();

    expect(keysBilled()).toEqual([`user:${owner.id}:api`]);
    expect(consume).toHaveBeenCalledWith(
      `user:${owner.id}:api`,
      PLANS[owner.tier].policy,
    );
    // The reader's identity is consulted — for the access log's actor only —
    // but the anonymous reader had none, and the owner is who was billed.
    expect(getSessionFromHeaders).toHaveBeenCalledTimes(1);
    expect(findUniqueApiKey).not.toHaveBeenCalled();
  });

  it("record the owner and resource for the log even on an anonymous read", async () => {
    const { assertCanRead } = await import("@/lib/documents");
    const { recordedAccess } = await import("@/lib/accessLog");
    const req = new Request("http://test/api/documents/doc-1");

    await assertCanRead(req, doc(true));

    expect(recordedAccess(req)).toEqual({
      credential: "none",
      actorUserId: null,
      ownerUserId: owner.id,
      apiKeyId: null,
      documentId: "doc-1",
      workspaceId: null,
    });
  });

  it("refuse the read as 429 when the owner's bucket is empty", async () => {
    const { assertCanRead } = await import("@/lib/documents");
    consume.mockResolvedValue({
      ...allowed,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    await expect(
      assertCanRead(new Request("http://test/api/documents/doc-1"), doc(true)),
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe("private-document reads", () => {
  it("bill nothing on an anonymous read (a 401 has no bucket)", async () => {
    const { assertCanRead } = await import("@/lib/documents");
    await expect(
      assertCanRead(new Request("http://test/api/documents/doc-1"), doc(false)),
    ).rejects.toMatchObject({ status: 401 });
    expect(consume).not.toHaveBeenCalled();
  });

  it("bill the caller, not the owner, on a 403", async () => {
    const { assertCanRead } = await import("@/lib/documents");
    const stranger = { ...owner, id: "stranger-1" } as User;
    findUniqueApiKey.mockResolvedValue({
      id: "k",
      revokedAt: null,
      user: stranger,
    });

    await expect(
      assertCanRead(
        new Request("http://test/api/documents/doc-1", {
          headers: { "x-api-key": "sk_stranger" },
        }),
        doc(false),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(keysBilled()).toEqual([`user:${stranger.id}:api`]);
  });
});
