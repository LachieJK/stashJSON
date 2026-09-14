import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * DB-backed access-log tests: the tracer bullet of ADR-0002, end to end through
 * the real `GET /api/documents/[id]` handler into the `access_logs` table.
 *
 * OFF by default, same contract as routes.test.ts: they run only against a
 * throwaway Postgres named by TEST_DATABASE_URL, never the live Neon host.
 *
 * Handlers are invoked directly, outside a Next request scope, so the wrapper's
 * `after()` falls back to a detached write; each test waits for the row to
 * land rather than assuming it has.
 */

const testDbUrl = process.env.TEST_DATABASE_URL;
const PROD_MARKERS = ["neon.tech"];
const looksProd = !!testDbUrl && PROD_MARKERS.some((m) => testDbUrl.includes(m));
const enabled = !!testDbUrl && !looksProd;

if (!enabled) {
  // eslint-disable-next-line no-console
  console.info(
    "[integration] Skipping access-log tests: set TEST_DATABASE_URL to a " +
      "throwaway (non-Neon) Postgres to enable them.",
  );
}

if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

type AccessLogRow = import("@/prisma/generated/client").AccessLog;

describe.skipIf(!enabled)("access log (DB-backed)", () => {
  let prisma: import("@/prisma/generated/client").PrismaClient;
  let GET: typeof import("@/app/api/documents/[id]/route").GET;
  const createdUserIds: string[] = [];

  async function newUser(label: string) {
    const { randomUUID } = await import("node:crypto");
    const { issueApiKey } = await import("@/lib/apiKeys");
    const user = await prisma.user.create({
      data: { name: label, email: `al_${label}_${randomUUID()}@stashjson.local` },
    });
    createdUserIds.push(user.id);
    const { raw, record } = await issueApiKey(user.id, "Default key");
    return { user, raw, keyId: record.id };
  }

  async function newDocument(userId: string, isPublic: boolean) {
    const { generateDocumentId } = await import("@/lib/utils");
    const workspace = await prisma.workspace.create({
      data: { userId, name: "Logged workspace" },
    });
    return prisma.document.create({
      data: {
        id: generateDocumentId(),
        userId,
        workspaceId: workspace.id,
        jsonData: { hello: "world" },
        isPublic,
      },
    });
  }

  const read = (id: string, apiKey?: string) =>
    GET(
      new Request(`http://test/api/documents/${id}?should=not&be=stored`, {
        headers: {
          "user-agent": "probe/1.0",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
      }),
      { params: Promise.resolve({ id }) },
    );

  /**
   * The single entry written for a path (and method), once it has landed.
   * Test files share the database and now every route logs, so a lookup on a
   * path without an id in it (`/api/keys`) must also be scoped to its actor.
   */
  async function entryFor(
    path: string,
    method?: string,
    actorUserId?: string,
  ): Promise<AccessLogRow> {
    return vi.waitFor(
      async () => {
        const rows = await prisma.accessLog.findMany({
          where: { path, method, actorUserId },
        });
        expect(rows).toHaveLength(1);
        return rows[0];
      },
      { timeout: 2000, interval: 25 },
    );
  }

  const jsonHeaders = (extra: Record<string, string> = {}) => ({
    "content-type": "application/json",
    ...extra,
  });

  /** Sign up through Better Auth and return the session cookie header. */
  async function signUpSession(label: string): Promise<string> {
    const { randomUUID } = await import("node:crypto");
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const email = `al_${label}_${randomUUID()}@stashjson.local`;
    const res = await POST(
      new Request("http://test/api/auth/sign-up/email", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ email, password: "sup3r-secret-pw", name: label }),
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

  /** Empty a user's `:api` bucket so their next metered request is a 429. */
  async function drainApiBucket(userId: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO rate_limit_bucket (key, tokens, updated_at)
       VALUES ($1, 0, now())
       ON CONFLICT (key) DO UPDATE SET tokens = 0, updated_at = now()`,
      `user:${userId}:api`,
    );
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    GET = (await import("@/app/api/documents/[id]/route")).GET;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length) {
      // Owner rows cascade with the users; the unknown-id entry has no owner.
      await prisma.accessLog.deleteMany({
        where: { OR: [{ ownerUserId: { in: createdUserIds } }, { ownerUserId: null }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("anonymous read of a public document: credential none, owner set, actor null", async () => {
    const owner = await newUser("pubowner");
    const doc = await newDocument(owner.user.id, true);

    const res = await read(doc.id);
    expect(res.status).toBe(200);

    const entry = await entryFor(`/api/documents/${doc.id}`);
    expect(entry).toMatchObject({
      method: "GET",
      route: "/api/documents/[id]",
      status: 200,
      credential: "none",
      actorUserId: null,
      ownerUserId: owner.user.id,
      apiKeyId: null,
      documentId: doc.id,
      workspaceId: doc.workspaceId,
    });
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("owner reads their own document by API key: actor = owner, api_key, key id set", async () => {
    const owner = await newUser("keyowner");
    const doc = await newDocument(owner.user.id, false);

    const res = await read(doc.id, owner.raw);
    expect(res.status).toBe(200);

    const entry = await entryFor(`/api/documents/${doc.id}`);
    expect(entry).toMatchObject({
      status: 200,
      credential: "api_key",
      actorUserId: owner.user.id,
      ownerUserId: owner.user.id,
      apiKeyId: owner.keyId,
      documentId: doc.id,
      workspaceId: doc.workspaceId,
    });
  });

  it("read of an unknown id: status 404 with a null owner, not the actor", async () => {
    const actor = await newUser("prober");
    const id = "nope_" + Date.now().toString(36);

    const res = await read(id, actor.raw);
    expect(res.status).toBe(404);

    const entry = await entryFor(`/api/documents/${id}`);
    expect(entry).toMatchObject({
      status: 404,
      ownerUserId: null,
      documentId: null,
      workspaceId: null,
      // The 404 fires before any resolver runs: nobody was identified.
      credential: "none",
      actorUserId: null,
      apiKeyId: null,
    });
  });

  it("anonymous read of a private document: status 401, owner set, actor null", async () => {
    const owner = await newUser("privowner");
    const doc = await newDocument(owner.user.id, false);

    const res = await read(doc.id);
    expect(res.status).toBe(401);

    const entry = await entryFor(`/api/documents/${doc.id}`);
    expect(entry).toMatchObject({
      status: 401,
      credential: "none",
      actorUserId: null,
      ownerUserId: owner.user.id,
      documentId: doc.id,
      workspaceId: doc.workspaceId,
    });
  });

  it("a rejected (429) request still produces an entry with its final status", async () => {
    const owner = await newUser("drained");
    const doc = await newDocument(owner.user.id, true);
    await drainApiBucket(owner.user.id);

    const res = await read(doc.id);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);

    const entry = await entryFor(`/api/documents/${doc.id}`);
    expect(entry).toMatchObject({
      status: 429,
      credential: "none",
      ownerUserId: owner.user.id,
      documentId: doc.id,
    });
  });

  it("stores no personal data: no IP, user agent, header, query string or key", async () => {
    const owner = await newUser("privacy");
    const doc = await newDocument(owner.user.id, true);
    await read(doc.id, owner.raw);
    const entry = await entryFor(`/api/documents/${doc.id}`);

    // The row's whole shape: exactly the columns ADR-0002 allows, nothing more.
    expect(Object.keys(entry).sort()).toEqual(
      [
        "id",
        "at",
        "method",
        "route",
        "path",
        "status",
        "durationMs",
        "credential",
        "actorUserId",
        "ownerUserId",
        "apiKeyId",
        "documentId",
        "workspaceId",
      ].sort(),
    );
    const serialised = JSON.stringify(entry);
    expect(serialised).not.toContain("probe/1.0");
    expect(serialised).not.toContain("should=not");
    expect(serialised).not.toContain(owner.raw);
    expect(entry.path).toBe(`/api/documents/${doc.id}`);
  });

  describe("every non-exempt route leaves one entry per request", () => {
    it("the full flow: key → workspace → document → update → versions → read → delete", async () => {
      const cookie = await signUpSession("flow");
      const keys = await import("@/app/api/keys/route");
      const workspaces = await import("@/app/api/workspaces/route");
      const documents = await import("@/app/api/documents/route");
      const byId = await import("@/app/api/documents/[id]/route");
      const versions = await import("@/app/api/documents/[id]/versions/route");

      // Issue the key from the dashboard: a session request, no key id.
      const keyRes = await keys.POST(
        new Request("http://test/api/keys", {
          method: "POST",
          headers: jsonHeaders({ cookie }),
          body: JSON.stringify({ name: "flow" }),
        }),
      );
      expect(keyRes.status).toBe(201);
      const { api_key: raw, key } = await keyRes.json();
      const userId = (await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } })).userId;
      expect(await entryFor("/api/keys", "POST", userId)).toMatchObject({
        route: "/api/keys",
        status: 201,
        credential: "session",
        actorUserId: userId,
        ownerUserId: userId,
        apiKeyId: null,
      });

      const asOwner = jsonHeaders({ "x-api-key": raw });
      const byKey = {
        credential: "api_key",
        actorUserId: userId,
        ownerUserId: userId,
        apiKeyId: key.id,
      };

      const wsRes = await workspaces.POST(
        new Request("http://test/api/workspaces", {
          method: "POST",
          headers: asOwner,
          body: JSON.stringify({ name: "Flow" }),
        }),
      );
      expect(wsRes.status).toBe(201);
      const ws = await wsRes.json();
      expect(await entryFor("/api/workspaces", "POST", userId)).toMatchObject({
        ...byKey,
        route: "/api/workspaces",
        status: 201,
        workspaceId: ws.id,
        documentId: null,
      });

      const docRes = await documents.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: asOwner,
          body: JSON.stringify({ json_data: { v: 1 }, workspace_id: ws.id }),
        }),
      );
      expect(docRes.status).toBe(201);
      const doc = await docRes.json();
      expect(await entryFor("/api/documents", "POST", userId)).toMatchObject({
        ...byKey,
        route: "/api/documents",
        status: 201,
        documentId: doc.id,
        workspaceId: ws.id,
      });

      const path = `/api/documents/${doc.id}`;
      const ctx = { params: Promise.resolve({ id: doc.id }) };
      const onDoc = { ...byKey, documentId: doc.id, workspaceId: ws.id };

      const put = await byId.PUT(
        new Request(`http://test${path}`, {
          method: "PUT",
          headers: asOwner,
          body: JSON.stringify({ json_data: { v: 2 } }),
        }),
        ctx,
      );
      expect(put.status).toBe(200);
      expect(await entryFor(path, "PUT")).toMatchObject({
        ...onDoc,
        route: "/api/documents/[id]",
        status: 200,
      });

      const patch = await byId.PATCH(
        new Request(`http://test${path}`, {
          method: "PATCH",
          headers: asOwner,
          body: JSON.stringify({ json_data: { w: 3 } }),
        }),
        ctx,
      );
      expect(patch.status).toBe(200);
      expect(await entryFor(path, "PATCH")).toMatchObject({ ...onDoc, status: 200 });

      const list = await versions.GET(
        new Request(`http://test${path}/versions`, { headers: asOwner }),
        ctx,
      );
      expect(list.status).toBe(200);
      expect(await entryFor(`${path}/versions`, "GET")).toMatchObject({
        ...onDoc,
        route: "/api/documents/[id]/versions",
        status: 200,
      });

      const get = await byId.GET(new Request(`http://test${path}`, { headers: asOwner }), ctx);
      expect(get.status).toBe(200);
      expect(await entryFor(path, "GET")).toMatchObject({ ...onDoc, status: 200 });

      const del = await byId.DELETE(
        new Request(`http://test${path}`, { method: "DELETE", headers: asOwner }),
        ctx,
      );
      expect(del.status).toBe(204);
      expect(await entryFor(path, "DELETE")).toMatchObject({ ...onDoc, status: 204 });

      // Exactly one entry per request, and nothing else attributed to this actor.
      expect(await prisma.accessLog.count({ where: { actorUserId: userId } })).toBe(8);
    });

    it("dashboard key management by session cookie: credential session, no key id", async () => {
      const cookie = await signUpSession("dash");
      const keys = await import("@/app/api/keys/route");
      const keyById = await import("@/app/api/keys/[id]/route");

      const created = await keys.POST(
        new Request("http://test/api/keys", {
          method: "POST",
          headers: jsonHeaders({ cookie }),
          body: JSON.stringify({ name: "dash" }),
        }),
      );
      const { key } = await created.json();
      const userId = (await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } })).userId;

      const listed = await keys.GET(new Request("http://test/api/keys", { headers: { cookie } }));
      expect(listed.status).toBe(200);
      expect(await entryFor("/api/keys", "GET", userId)).toMatchObject({
        credential: "session",
        actorUserId: userId,
        ownerUserId: userId,
        apiKeyId: null,
        status: 200,
      });

      const revoked = await keyById.DELETE(
        new Request(`http://test/api/keys/${key.id}`, { method: "DELETE", headers: { cookie } }),
        { params: Promise.resolve({ id: key.id }) },
      );
      expect(revoked.status).toBe(204);
      expect(await entryFor(`/api/keys/${key.id}`, "DELETE")).toMatchObject({
        route: "/api/keys/[id]",
        credential: "session",
        actorUserId: userId,
        apiKeyId: null,
        status: 204,
      });

      // No cookie at all: a 401 is still an entry, with nobody identified.
      // Anonymous, so there is no actor to scope by: bound it by time instead
      // (other files' anonymous 401s on this path have the same shape anyway).
      const since = new Date();
      const anon = await keys.GET(new Request("http://test/api/keys"));
      expect(anon.status).toBe(401);
      const entries = await vi.waitFor(async () => {
        const rows = await prisma.accessLog.findMany({
          where: { path: "/api/keys", method: "GET", status: 401, at: { gte: since } },
        });
        expect(rows.length).toBeGreaterThanOrEqual(1);
        return rows;
      });
      for (const entry of entries) {
        expect(entry).toMatchObject({
          credential: "none",
          actorUserId: null,
          ownerUserId: null,
          apiKeyId: null,
        });
      }
    });

    it("a stranger's refused write (403) records the owner and the stranger as actor", async () => {
      const owner = await newUser("w-owner");
      const stranger = await newUser("w-stranger");
      const doc = await newDocument(owner.user.id, false);
      const byId = await import("@/app/api/documents/[id]/route");

      const res = await byId.DELETE(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "DELETE",
          headers: { "x-api-key": stranger.raw },
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(403);
      expect(await entryFor(`/api/documents/${doc.id}`, "DELETE")).toMatchObject({
        status: 403,
        credential: "api_key",
        actorUserId: stranger.user.id,
        apiKeyId: stranger.keyId,
        ownerUserId: owner.user.id,
        documentId: doc.id,
        workspaceId: doc.workspaceId,
      });
    });

    it("workspace 404s: unknown id has a null owner; someone else's records its owner", async () => {
      const owner = await newUser("ws-owner");
      const stranger = await newUser("ws-stranger");
      const ws = await prisma.workspace.create({
        data: { userId: owner.user.id, name: "Not yours" },
      });
      const byId = await import("@/app/api/workspaces/[id]/route");
      const { randomUUID } = await import("node:crypto");
      const unknown = randomUUID();

      const missing = await byId.GET(
        new Request(`http://test/api/workspaces/${unknown}`, {
          headers: { "x-api-key": stranger.raw },
        }),
        { params: Promise.resolve({ id: unknown }) },
      );
      expect(missing.status).toBe(404);
      expect(await entryFor(`/api/workspaces/${unknown}`, "GET")).toMatchObject({
        route: "/api/workspaces/[id]",
        status: 404,
        actorUserId: stranger.user.id,
        ownerUserId: null,
        workspaceId: null,
      });

      const foreign = await byId.GET(
        new Request(`http://test/api/workspaces/${ws.id}`, {
          headers: { "x-api-key": stranger.raw },
        }),
        { params: Promise.resolve({ id: ws.id }) },
      );
      expect(foreign.status).toBe(404);
      expect(await entryFor(`/api/workspaces/${ws.id}`, "GET")).toMatchObject({
        status: 404,
        actorUserId: stranger.user.id,
        ownerUserId: owner.user.id,
        workspaceId: ws.id,
      });
    });

    it("/api/health and /api/auth/** produce no entries", async () => {
      const health = await import("@/app/api/health/route");
      expect((await health.GET()).status).toBe(200);
      await signUpSession("exempt");

      // Give a stray write every chance to land before asserting its absence.
      await new Promise((r) => setTimeout(r, 200));
      expect(
        await prisma.accessLog.count({
          where: { OR: [{ path: "/api/health" }, { path: { startsWith: "/api/auth/" } }] },
        }),
      ).toBe(0);
    });
  });

  describe("pruning", () => {
    /** Seed `count` entries for `ownerUserId`, each `at` the given instant. */
    async function seed(ownerUserId: string, at: Date, count: number, tag: string) {
      await prisma.accessLog.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          at,
          method: "GET",
          route: "/api/documents/[id]",
          path: `/api/documents/seed-${tag}-${i}`,
          status: 200,
          durationMs: 1,
          credential: "none" as const,
          ownerUserId,
        })),
      });
    }

    const remaining = (ownerUserId: string, tag: string) =>
      prisma.accessLog.count({
        where: { ownerUserId, path: { startsWith: `/api/documents/seed-${tag}-` } },
      });

    const daysAgo = (days: number, offsetMs = 0) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000 + offsetMs);

    it("pruneAccessLog deletes past the window only, in bounded batches, oldest first", async () => {
      const { pruneAccessLog, RETENTION_DAYS, retentionCutoff } = await import("@/lib/accessLog");
      const owner = await newUser("prune-bound");
      const now = new Date();
      const cutoff = retentionCutoff(now);

      // Either side of the boundary, one second apart, plus a deep backlog.
      await seed(owner.user.id, new Date(cutoff.getTime() - 1000), 1, "expired-edge");
      await seed(owner.user.id, new Date(cutoff.getTime() + 1000), 1, "kept-edge");
      await seed(owner.user.id, daysAgo(RETENTION_DAYS + 5), 7, "backlog");
      await seed(owner.user.id, daysAgo(1), 3, "recent");

      // 8 expired rows, batches of 3: 3, 3, 2, then nothing left to do.
      expect(await pruneAccessLog(now, 3)).toBe(3);
      // Oldest first: the 5-days-past backlog goes before the edge case.
      expect(await remaining(owner.user.id, "backlog")).toBe(4);
      expect(await remaining(owner.user.id, "expired-edge")).toBe(1);
      expect(await pruneAccessLog(now, 3)).toBe(3);
      expect(await pruneAccessLog(now, 3)).toBe(2);
      expect(await pruneAccessLog(now, 3)).toBe(0);

      expect(await remaining(owner.user.id, "backlog")).toBe(0);
      expect(await remaining(owner.user.id, "expired-edge")).toBe(0);
      expect(await remaining(owner.user.id, "kept-edge")).toBe(1);
      expect(await remaining(owner.user.id, "recent")).toBe(3);
    });

    it("driving requests drains a seeded backlog in PRUNE_BATCH_SIZE steps", async () => {
      const { PRUNE_BATCH_SIZE, RETENTION_DAYS } = await import("@/lib/accessLog");
      const owner = await newUser("prune-drive");
      const doc = await newDocument(owner.user.id, true);
      const backlog = PRUNE_BATCH_SIZE + 50;
      await seed(owner.user.id, daysAgo(RETENTION_DAYS + 1), backlog, "drive");
      await seed(owner.user.id, daysAgo(RETENTION_DAYS - 1), 5, "keep");

      // Force the 1-in-N roll to hit on every request.
      const random = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        expect((await read(doc.id)).status).toBe(200);
        await vi.waitFor(
          async () => expect(await remaining(owner.user.id, "drive")).toBe(50),
          { timeout: 5000, interval: 50 },
        );
        expect((await read(doc.id)).status).toBe(200);
        await vi.waitFor(
          async () => expect(await remaining(owner.user.id, "drive")).toBe(0),
          { timeout: 5000, interval: 50 },
        );
      } finally {
        random.mockRestore();
      }

      expect(await remaining(owner.user.id, "keep")).toBe(5);
      // The requests' own entries were written and are inside the window.
      await vi.waitFor(async () =>
        expect(
          await prisma.accessLog.count({ where: { path: `/api/documents/${doc.id}` } }),
        ).toBe(2),
      );
    }, 15_000);
  });

  it("deleting the actor nulls their entries; deleting the owner removes theirs", async () => {
    const owner = await newUser("cascade-owner");
    const stranger = await newUser("cascade-stranger");
    const doc = await newDocument(owner.user.id, true);

    await read(doc.id, stranger.raw);
    const entry = await entryFor(`/api/documents/${doc.id}`);
    expect(entry).toMatchObject({
      actorUserId: stranger.user.id,
      ownerUserId: owner.user.id,
    });

    await prisma.user.delete({ where: { id: stranger.user.id } });
    expect(
      await prisma.accessLog.findUniqueOrThrow({ where: { id: entry.id } }),
    ).toMatchObject({ actorUserId: null, ownerUserId: owner.user.id, documentId: doc.id });

    await prisma.user.delete({ where: { id: owner.user.id } });
    expect(await prisma.accessLog.findUnique({ where: { id: entry.id } })).toBeNull();
  });
});
