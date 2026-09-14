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

  /** The single entry written for a path, once it has landed. */
  async function entryFor(path: string): Promise<AccessLogRow> {
    return vi.waitFor(
      async () => {
        const rows = await prisma.accessLog.findMany({ where: { path } });
        expect(rows).toHaveLength(1);
        return rows[0];
      },
      { timeout: 2000, interval: 25 },
    );
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
