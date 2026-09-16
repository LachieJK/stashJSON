import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Plan quotas against a real Postgres (#61). A FREE account's caps of one
 * workspace and one API key are cheap to hit, so this exercises the whole
 * soft-cap contract end to end:
 *
 *  - the create that reaches the cap is a 201, the next is a 403 with the
 *    quota-exceeded `type`;
 *  - an account at (or over) its cap can still read, update and delete what
 *    it holds — nothing but create consults the quota;
 *  - deleting / revoking frees the slot; a revoked key does not count;
 *  - a TEAM account is never refused.
 *
 * Same opt-in as the other DB-backed suites: TEST_DATABASE_URL, never Neon.
 */

const testDbUrl = process.env.TEST_DATABASE_URL;
const PROD_MARKERS = ["neon.tech"];
const looksProd = !!testDbUrl && PROD_MARKERS.some((m) => testDbUrl.includes(m));
const enabled = !!testDbUrl && !looksProd;

if (!enabled) {
  // eslint-disable-next-line no-console
  console.info(
    "[integration] Skipping quota tests: set TEST_DATABASE_URL to a " +
      "throwaway (non-Neon) Postgres to enable them.",
  );
}
if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

const QUOTA_TYPE = "https://stashjson.com/docs/errors/quota-exceeded";

describe.skipIf(!enabled)("plan quotas (DB-backed)", () => {
  let prisma: import("@/prisma/generated/client").PrismaClient;
  const createdUserIds: string[] = [];

  const jsonHeaders = (extra: Record<string, string> = {}) => ({
    "content-type": "application/json",
    ...extra,
  });

  /** A user with one API key already issued (as sign-up does), on the given tier. */
  async function newUser(tier: "FREE" | "TEAM") {
    const { randomUUID } = await import("node:crypto");
    const { issueApiKey } = await import("@/lib/apiKeys");
    const user = await prisma.user.create({
      data: { name: "Quota user", email: `q_${randomUUID()}@stashjson.local`, tier },
    });
    createdUserIds.push(user.id);
    const { raw } = await issueApiKey(user.id, "Default key");
    return { user, headers: jsonHeaders({ "x-api-key": raw }) };
  }

  /** Sign up through Better Auth and return the session cookie header. */
  async function signUpSession(): Promise<string> {
    const { randomUUID } = await import("node:crypto");
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const email = `q_session_${randomUUID()}@stashjson.local`;
    const res = await POST(
      new Request("http://test/api/auth/sign-up/email", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ email, password: "sup3r-secret-pw", name: "Quota" }),
      }),
    );
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);
    return cookie;
  }

  const expectQuotaRefusal = async (res: Response) => {
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      detail: expect.stringMatching(/^Plan quota exceeded/),
      type: QUOTA_TYPE,
    });
  };

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("workspaces: 201 up to the cap, 403 past it, everything else still works", async () => {
    const { headers } = await newUser("FREE");
    const list = await import("@/app/api/workspaces/route");
    const item = await import("@/app/api/workspaces/[id]/route");
    const create = (name: string) =>
      list.POST(
        new Request("http://test/api/workspaces", {
          method: "POST",
          headers,
          body: JSON.stringify({ name }),
        }),
      );

    const first = await create("Only one");
    expect(first.status).toBe(201);
    const { id } = await first.json();

    await expectQuotaRefusal(await create("One too many"));

    // At cap: read, list, rename and delete are untouched.
    const ctx = { params: Promise.resolve({ id }) };
    const got = await item.GET(new Request(`http://test/api/workspaces/${id}`, { headers }), ctx);
    expect(got.status).toBe(200);
    const listed = await list.GET(new Request("http://test/api/workspaces", { headers }));
    expect(listed.status).toBe(200);
    const renamed = await item.PUT(
      new Request(`http://test/api/workspaces/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ name: "Renamed at cap" }),
      }),
      ctx,
    );
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).name).toBe("Renamed at cap");
    const deleted = await item.DELETE(
      new Request(`http://test/api/workspaces/${id}`, { method: "DELETE", headers }),
      ctx,
    );
    expect(deleted.status).toBe(204);

    // Deleting freed the slot.
    expect((await create("Again")).status).toBe(201);
  });

  it("documents: an account at its workspace cap can still write documents", async () => {
    const { headers } = await newUser("FREE");
    const ws = await import("@/app/api/workspaces/route");
    const docs = await import("@/app/api/documents/route");
    const doc = await import("@/app/api/documents/[id]/route");
    const created = await ws.POST(
      new Request("http://test/api/workspaces", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Full" }),
      }),
    );
    const { id: workspaceId } = await created.json();

    // Below the document cap: creates go through, inside and outside the
    // (now full) workspace — the caps are independent counts.
    const inside = await docs.POST(
      new Request("http://test/api/documents", {
        method: "POST",
        headers,
        body: JSON.stringify({ json_data: { n: 1 }, workspace_id: workspaceId }),
      }),
    );
    expect(inside.status).toBe(201);
    const { id } = await inside.json();
    const outside = await docs.POST(
      new Request("http://test/api/documents", {
        method: "POST",
        headers,
        body: JSON.stringify({ json_data: { n: 2 } }),
      }),
    );
    expect(outside.status).toBe(201);

    // Updates cut versions as usual; no quota is consulted.
    const ctx = { params: Promise.resolve({ id }) };
    const patched = await doc.PATCH(
      new Request(`http://test/api/documents/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ json_data: { m: 2 } }),
      }),
      ctx,
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).version).toBe(2);
  });

  it("API keys: the sign-up key fills a FREE cap; revoking frees it", async () => {
    const cookie = await signUpSession();
    const headers = jsonHeaders({ cookie });
    const keys = await import("@/app/api/keys/route");
    const key = await import("@/app/api/keys/[id]/route");
    const mint = (name: string) =>
      keys.POST(
        new Request("http://test/api/keys", {
          method: "POST",
          headers,
          body: JSON.stringify({ name }),
        }),
      );

    // A fresh session-only account holds no key: the first mint is fine.
    const first = await mint("ci");
    expect(first.status).toBe(201);
    const { key: minted } = await first.json();

    await expectQuotaRefusal(await mint("one too many"));

    // Listing at cap is fine; revoking frees the slot because revoked keys
    // don't count.
    expect((await keys.GET(new Request("http://test/api/keys", { headers }))).status).toBe(200);
    const revoked = await key.DELETE(
      new Request(`http://test/api/keys/${minted.id}`, { method: "DELETE", headers }),
      { params: Promise.resolve({ id: minted.id }) },
    );
    expect(revoked.status).toBe(204);
    expect((await mint("replacement")).status).toBe(201);
  });

  it("a TEAM account's null caps never refuse", async () => {
    const { headers } = await newUser("TEAM");
    const { POST } = await import("@/app/api/workspaces/route");
    for (const name of ["a", "b", "c"]) {
      const res = await POST(
        new Request("http://test/api/workspaces", {
          method: "POST",
          headers,
          body: JSON.stringify({ name }),
        }),
      );
      expect(res.status).toBe(201);
    }
  });
});
