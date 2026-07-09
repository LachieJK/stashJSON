import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DB-backed route-handler integration tests.
 *
 * SAFETY: these are OFF by default. They only run when TEST_DATABASE_URL is set
 * to a throwaway Postgres that is NOT a production/Neon host. We never touch the
 * `.env` DATABASE_URL (which points at live Neon data) from here.
 *
 * To enable locally:
 *   1. Start a disposable Postgres (e.g. `docker compose up -d`).
 *   2. Point Prisma at it and apply the schema:
 *        TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stashjson_test?schema=public
 *        DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
 *   3. Run: TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test
 */

const testDbUrl = process.env.TEST_DATABASE_URL;

// Refuse anything that looks like the production database. `neon.tech` covers
// every Neon host, including the one in this repo's .env.
const PROD_MARKERS = ["neon.tech"];
const looksProd =
  !!testDbUrl && PROD_MARKERS.some((m) => testDbUrl.includes(m));
const enabled = !!testDbUrl && !looksProd;

if (!enabled) {
  const why = looksProd
    ? "TEST_DATABASE_URL points at a production/Neon host — refusing to run."
    : "TEST_DATABASE_URL is not set.";
  // eslint-disable-next-line no-console
  console.info(
    `[integration] Skipping DB-backed route tests: ${why} ` +
      "Set TEST_DATABASE_URL to a throwaway (non-Neon) Postgres to enable them.",
  );
}

// Point Prisma at the test DB *before* any lib/route module (which imports
// lib/db → lib/env) is loaded. Modules are pulled in lazily inside the tests so
// that, when disabled, nothing ever connects to a database.
if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

const jsonHeaders = (apiKey?: string) => ({
  "content-type": "application/json",
  ...(apiKey ? { "x-api-key": apiKey } : {}),
});

describe.skipIf(!enabled)("route handlers (DB-backed)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  const createdUserIds: string[] = [];

  async function newUserKey(email?: string): Promise<string> {
    const { POST } = await import("@/app/api/auth/generate-key/route");
    const req = new Request("http://test/api/auth/generate-key", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(email ? { email } : {}),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { api_key: string };
    const user = await prisma.user.findUnique({
      where: { apiKeyHash: (await import("@/lib/utils")).hashApiKey(body.api_key) },
    });
    if (user) createdUserIds.push(user.id);
    return body.api_key;
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Cascades clean up workspaces/documents/versions owned by these users.
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  describe("auth", () => {
    it("POST /api/documents without an API key → 401 { detail }", async () => {
      const { POST } = await import("@/app/api/documents/route");
      const req = new Request("http://test/api/documents", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ json_data: { a: 1 } }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: expect.any(String) });
    });
  });

  describe("document lifecycle + versioning", () => {
    it("creates a document, then PUT snapshots the prior version and increments", async () => {
      const key = await newUserKey("versioning@test.local");

      const create = await import("@/app/api/documents/route");
      const createReq = new Request("http://test/api/documents", {
        method: "POST",
        headers: jsonHeaders(key),
        body: JSON.stringify({ json_data: { v: 1 }, is_public: false }),
      });
      const createRes = await create.POST(createReq);
      expect(createRes.status).toBe(201);
      const doc = (await createRes.json()) as {
        id: string;
        version: number;
        json_data: unknown;
      };
      expect(doc.version).toBe(1);

      const byId = await import("@/app/api/documents/[id]/route");
      const putReq = new Request(`http://test/api/documents/${doc.id}`, {
        method: "PUT",
        headers: jsonHeaders(key),
        body: JSON.stringify({ json_data: { v: 2 } }),
      });
      const putRes = await byId.PUT(putReq, {
        params: Promise.resolve({ id: doc.id }),
      });
      expect(putRes.status).toBe(200);
      const updated = (await putRes.json()) as {
        version: number;
        json_data: { v: number };
      };
      expect(updated.version).toBe(2);
      expect(updated.json_data).toEqual({ v: 2 });

      // A snapshot of the prior (v1) data must now exist.
      const versions = await prisma.documentVersion.findMany({
        where: { documentId: doc.id },
      });
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].jsonData).toEqual({ v: 1 });
    });

    it("PATCH shallow-merges json_data", async () => {
      const key = await newUserKey();
      const create = await import("@/app/api/documents/route");
      const createRes = await create.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { a: 1, b: 2 } }),
        }),
      );
      const doc = (await createRes.json()) as { id: string };

      const byId = await import("@/app/api/documents/[id]/route");
      const patchRes = await byId.PATCH(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { b: 20, c: 3 } }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(patchRes.status).toBe(200);
      const merged = (await patchRes.json()) as {
        json_data: Record<string, number>;
      };
      expect(merged.json_data).toEqual({ a: 1, b: 20, c: 3 });
    });
  });

  describe("reads", () => {
    it("serves a public document without a key, but 401s a private one", async () => {
      const key = await newUserKey();
      const create = await import("@/app/api/documents/route");
      const publicRes = await create.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { open: true }, is_public: true }),
        }),
      );
      const pub = (await publicRes.json()) as { id: string };

      const privateRes = await create.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { secret: true } }),
        }),
      );
      const priv = (await privateRes.json()) as { id: string };

      const byId = await import("@/app/api/documents/[id]/route");
      const openRes = await byId.GET(
        new Request(`http://test/api/documents/${pub.id}`, {
          headers: jsonHeaders(),
        }),
        { params: Promise.resolve({ id: pub.id }) },
      );
      expect(openRes.status).toBe(200);

      const blockedRes = await byId.GET(
        new Request(`http://test/api/documents/${priv.id}`, {
          headers: jsonHeaders(),
        }),
        { params: Promise.resolve({ id: priv.id }) },
      );
      expect(blockedRes.status).toBe(401);
    });
  });

  describe("template enforcement", () => {
    it("rejects a non-conforming document with 400 and accepts a conforming one", async () => {
      const key = await newUserKey();

      const wsMod = await import("@/app/api/workspaces/route");
      const wsRes = await wsMod.POST(
        new Request("http://test/api/workspaces", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({ name: "Templated" }),
        }),
      );
      const ws = (await wsRes.json()) as { id: string };

      const tplMod = await import("@/app/api/workspaces/[id]/template/route");
      const tplRes = await tplMod.PUT(
        new Request(`http://test/api/workspaces/${ws.id}/template`, {
          method: "PUT",
          headers: jsonHeaders(key),
          body: JSON.stringify({
            json_schema: {
              type: "object",
              properties: { name: { type: "string" } },
              required: ["name"],
            },
          }),
        }),
        { params: Promise.resolve({ id: ws.id }) },
      );
      expect(tplRes.status).toBe(200);

      const create = await import("@/app/api/documents/route");
      const bad = await create.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({
            json_data: { name: 123 },
            workspace_id: ws.id,
          }),
        }),
      );
      expect(bad.status).toBe(400);

      const good = await create.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({
            json_data: { name: "ok" },
            workspace_id: ws.id,
          }),
        }),
      );
      expect(good.status).toBe(201);
    });
  });

  describe("workspace deletion nulls document.workspaceId (SetNull)", () => {
    it("keeps the document but detaches it from the deleted workspace", async () => {
      const key = await newUserKey();

      const wsMod = await import("@/app/api/workspaces/route");
      const wsRes = await wsMod.POST(
        new Request("http://test/api/workspaces", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({ name: "Doomed" }),
        }),
      );
      const ws = (await wsRes.json()) as { id: string };

      const create = await import("@/app/api/documents/route");
      const docRes = await create.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { keep: true }, workspace_id: ws.id }),
        }),
      );
      const doc = (await docRes.json()) as { id: string };

      const wsById = await import("@/app/api/workspaces/[id]/route");
      const delRes = await wsById.DELETE(
        new Request(`http://test/api/workspaces/${ws.id}`, {
          method: "DELETE",
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: ws.id }) },
      );
      expect(delRes.status).toBe(204);

      const survivor = await prisma.document.findUnique({
        where: { id: doc.id },
      });
      expect(survivor).not.toBeNull();
      expect(survivor?.workspaceId).toBeNull();
    });
  });
});
