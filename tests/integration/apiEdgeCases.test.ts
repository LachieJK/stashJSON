import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DB-backed edge-case / contract tests for the public API, complementing the
 * happy-path lifecycle coverage in routes.test.ts. Covers the authorization
 * matrix (401/403/404), the exact `{ detail }` error shape, the snake_case wire
 * contract, versioning corner cases, template-enforcement atomicity, and
 * pagination.
 *
 * SAFETY: identical guard to routes.test.ts — these tests only run when
 * TEST_DATABASE_URL points at a throwaway, non-Neon Postgres. The `.env`
 * DATABASE_URL (live Neon data) is never used.
 */

const testDbUrl = process.env.TEST_DATABASE_URL;

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
    `[integration] Skipping API edge-case tests: ${why} ` +
      "Set TEST_DATABASE_URL to a throwaway (non-Neon) Postgres to enable them.",
  );
}

if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

const jsonHeaders = (apiKey?: string) => ({
  "content-type": "application/json",
  ...(apiKey ? { "x-api-key": apiKey } : {}),
});

type DocWire = {
  id: string;
  json_data: Record<string, unknown>;
  is_public: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

type ErrWire = { detail: string };

describe.skipIf(!enabled)("API edge cases (DB-backed)", () => {
  let prisma: import("@/prisma/generated/client").PrismaClient;
  const createdUserIds: string[] = [];

  async function newUserKey(): Promise<string> {
    const { randomUUID } = await import("node:crypto");
    const { issueApiKey } = await import("@/lib/apiKeys");
    const user = await prisma.user.create({
      data: {
        name: "API key user",
        email: `apikey_${randomUUID()}@stashjson.local`,
      },
    });
    createdUserIds.push(user.id);
    const { raw } = await issueApiKey(user.id, "Default key");
    return raw;
  }

  async function createDoc(
    key: string,
    body: Record<string, unknown>,
    expectStatus = 201,
  ): Promise<DocWire> {
    const { POST } = await import("@/app/api/documents/route");
    const res = await POST(
      new Request("http://test/api/documents", {
        method: "POST",
        headers: jsonHeaders(key),
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(expectStatus);
    return (await res.json()) as DocWire;
  }

  async function createWorkspace(key: string, name: string): Promise<string> {
    const { POST } = await import("@/app/api/workspaces/route");
    const res = await POST(
      new Request("http://test/api/workspaces", {
        method: "POST",
        headers: jsonHeaders(key),
        body: JSON.stringify({ name }),
      }),
    );
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  async function putTemplate(
    key: string,
    wsId: string,
    schema: Record<string, unknown>,
  ) {
    const { PUT } = await import("@/app/api/workspaces/[id]/template/route");
    return PUT(
      new Request(`http://test/api/workspaces/${wsId}/template`, {
        method: "PUT",
        headers: jsonHeaders(key),
        body: JSON.stringify({ json_schema: schema }),
      }),
      { params: Promise.resolve({ id: wsId }) },
    );
  }

  // Sign up through Better Auth and return the resulting session cookie header.
  async function signUpSession(email: string): Promise<string> {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const res = await POST(
      new Request("http://test/api/auth/sign-up/email", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ email, password: "sup3r-secret-pw", name: "T" }),
      }),
    );
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) createdUserIds.push(user.id);
    return cookie;
  }

  beforeAll(async () => {
    const db = await import("@/lib/db");
    prisma = db.prisma;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  describe("error contract — every failure is `{ detail }` and nothing else", () => {
    it("401 (missing auth), 404 (unknown doc), 400 (bad body) all match", async () => {
      const key = await newUserKey();
      const docs = await import("@/app/api/documents/route");
      const byId = await import("@/app/api/documents/[id]/route");

      const unauth = await docs.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ json_data: {} }),
        }),
      );
      const missing = await byId.GET(
        new Request("http://test/api/documents/nope", {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: "does-not-exist-16" }) },
      );
      const badBody = await docs.POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: "not an object" }),
        }),
      );

      for (const [res, status] of [
        [unauth, 401],
        [missing, 404],
        [badBody, 400],
      ] as const) {
        expect(res.status).toBe(status);
        const body = (await res.json()) as ErrWire;
        expect(Object.keys(body)).toEqual(["detail"]);
        expect(typeof body.detail).toBe("string");
        expect(body.detail.length).toBeGreaterThan(0);
      }
    });

    it("rejects a syntactically malformed JSON body with a specific 400", async () => {
      const key = await newUserKey();
      const { POST } = await import("@/app/api/documents/route");
      const res = await POST(
        new Request("http://test/api/documents", {
          method: "POST",
          headers: jsonHeaders(key),
          body: "{not json at all",
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        detail: "Request body must be valid JSON",
      });
    });

    it("400s an empty PUT body (an object body is required)", async () => {
      const key = await newUserKey();
      const doc = await createDoc(key, { json_data: { a: 1 } });
      const byId = await import("@/app/api/documents/[id]/route");
      const res = await byId.PUT(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PUT",
          headers: jsonHeaders(key),
          body: "",
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrWire;
      expect(body.detail).toMatch(/^Validation error/);
    });

    it("401s an unknown API key on a resource route", async () => {
      const { GET } = await import("@/app/api/workspaces/route");
      const res = await GET(
        new Request("http://test/api/workspaces", {
          headers: jsonHeaders("totally-not-a-real-key-aaaaaaaaaa"),
        }),
      );
      expect(res.status).toBe(401);
      expect(Object.keys(await res.json())).toEqual(["detail"]);
    });
  });

  describe("snake_case wire contract", () => {
    it("document responses expose exactly the contract fields", async () => {
      const key = await newUserKey();
      const doc = await createDoc(key, {
        json_data: { a: 1 },
        is_public: true,
      });
      expect(Object.keys(doc).sort()).toEqual([
        "created_at",
        "id",
        "is_public",
        "json_data",
        "updated_at",
        "version",
      ]);
      expect(doc.id).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(doc.is_public).toBe(true);
      expect(doc.version).toBe(1);
    });

    it("workspace GET responses expose exactly the contract fields", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Shape check");
      const { GET } = await import("@/app/api/workspaces/[id]/route");
      const res = await GET(
        new Request(`http://test/api/workspaces/${wsId}`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(res.status).toBe(200);
      const ws = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(ws).sort()).toEqual([
        "created_at",
        "document_count",
        "has_template",
        "id",
        "name",
        "updated_at",
      ]);
      expect(ws.document_count).toBe(0);
      expect(ws.has_template).toBe(false);
    });

    it("template responses expose exactly the contract fields", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Template shape");
      const res = await putTemplate(key, wsId, { type: "object" });
      expect(res.status).toBe(200);
      const tpl = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(tpl).sort()).toEqual([
        "created_at",
        "id",
        "json_schema",
        "updated_at",
        "workspace_id",
      ]);
      expect(tpl.workspace_id).toBe(wsId);
    });
  });

  describe("document authorization matrix", () => {
    it("owner-only writes: non-owner gets 403, unknown id gets 404", async () => {
      const ownerKey = await newUserKey();
      const strangerKey = await newUserKey();
      const doc = await createDoc(ownerKey, { json_data: { mine: true } });
      const byId = await import("@/app/api/documents/[id]/route");

      const attempts = [
        byId.PUT(
          new Request(`http://test/api/documents/${doc.id}`, {
            method: "PUT",
            headers: jsonHeaders(strangerKey),
            body: JSON.stringify({ json_data: { stolen: true } }),
          }),
          { params: Promise.resolve({ id: doc.id }) },
        ),
        byId.PATCH(
          new Request(`http://test/api/documents/${doc.id}`, {
            method: "PATCH",
            headers: jsonHeaders(strangerKey),
            body: JSON.stringify({ json_data: { stolen: true } }),
          }),
          { params: Promise.resolve({ id: doc.id }) },
        ),
        byId.DELETE(
          new Request(`http://test/api/documents/${doc.id}`, {
            method: "DELETE",
            headers: jsonHeaders(strangerKey),
          }),
          { params: Promise.resolve({ id: doc.id }) },
        ),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.status).toBe(403);
      }

      const gone = await byId.DELETE(
        new Request("http://test/api/documents/zzzzzzzzzzzzzzzz", {
          method: "DELETE",
          headers: jsonHeaders(ownerKey),
        }),
        { params: Promise.resolve({ id: "zzzzzzzzzzzzzzzz" }) },
      );
      expect(gone.status).toBe(404);

      // The document is untouched by the failed attempts.
      const row = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(row?.jsonData).toEqual({ mine: true });
      expect(row?.version).toBe(1);
    });

    it("private reads: another user's valid key gets 403; anonymous gets 401", async () => {
      const ownerKey = await newUserKey();
      const strangerKey = await newUserKey();
      const doc = await createDoc(ownerKey, { json_data: { secret: 1 } });
      const byId = await import("@/app/api/documents/[id]/route");

      const asStranger = await byId.GET(
        new Request(`http://test/api/documents/${doc.id}`, {
          headers: jsonHeaders(strangerKey),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(asStranger.status).toBe(403);

      const anonymous = await byId.GET(
        new Request(`http://test/api/documents/${doc.id}`, {
          headers: jsonHeaders(),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(anonymous.status).toBe(401);
    });

    it("public docs are readable even with someone else's key", async () => {
      const ownerKey = await newUserKey();
      const strangerKey = await newUserKey();
      const doc = await createDoc(ownerKey, {
        json_data: { open: 1 },
        is_public: true,
      });
      const byId = await import("@/app/api/documents/[id]/route");
      const res = await byId.GET(
        new Request(`http://test/api/documents/${doc.id}`, {
          headers: jsonHeaders(strangerKey),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as DocWire).json_data).toEqual({ open: 1 });
    });

    it("an invalid API key is rejected even when a valid session cookie is also sent", async () => {
      // Dual auth gives X-API-Key precedence: a present-but-bad key fails hard
      // rather than falling back to the cookie. Locks in the current contract.
      const cookie = await signUpSession("dual-auth@test.local");
      const { POST } = await import("@/app/api/workspaces/route");
      const res = await POST(
        new Request("http://test/api/workspaces", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
            "x-api-key": "bogus-key-bogus-key-bogus-key-32",
          },
          body: JSON.stringify({ name: "Should not exist" }),
        }),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("cross-user workspace isolation", () => {
    it("another user's workspace 404s for GET/PUT/DELETE and document attach", async () => {
      const ownerKey = await newUserKey();
      const strangerKey = await newUserKey();
      const wsId = await createWorkspace(ownerKey, "Private WS");

      const wsById = await import("@/app/api/workspaces/[id]/route");
      const get = await wsById.GET(
        new Request(`http://test/api/workspaces/${wsId}`, {
          headers: jsonHeaders(strangerKey),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(get.status).toBe(404);

      const put = await wsById.PUT(
        new Request(`http://test/api/workspaces/${wsId}`, {
          method: "PUT",
          headers: jsonHeaders(strangerKey),
          body: JSON.stringify({ name: "Hijacked" }),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(put.status).toBe(404);

      const del = await wsById.DELETE(
        new Request(`http://test/api/workspaces/${wsId}`, {
          method: "DELETE",
          headers: jsonHeaders(strangerKey),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(del.status).toBe(404);

      // Attaching a document to someone else's workspace is a 404 too.
      const err = await createDoc(
        strangerKey,
        { json_data: {}, workspace_id: wsId },
        404,
      );
      expect((err as unknown as ErrWire).detail).toBe("Workspace not found");

      // And the workspace survived it all.
      expect(
        await prisma.workspace.findUnique({ where: { id: wsId } }),
      ).not.toBeNull();
    });

    it("GET /api/workspaces lists only the caller's workspaces", async () => {
      const keyA = await newUserKey();
      const keyB = await newUserKey();
      const wsA = await createWorkspace(keyA, "A's ws");
      await createWorkspace(keyB, "B's ws");

      const { GET } = await import("@/app/api/workspaces/route");
      const res = await GET(
        new Request("http://test/api/workspaces", { headers: jsonHeaders(keyA) }),
      );
      expect(res.status).toBe(200);
      const list = (await res.json()) as Array<{ id: string; name: string }>;
      expect(list.map((w) => w.id)).toEqual([wsA]);
    });

    it("PUT /api/workspaces/:id renames and returns the updated name", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Old name");
      const { PUT } = await import("@/app/api/workspaces/[id]/route");
      const res = await PUT(
        new Request(`http://test/api/workspaces/${wsId}`, {
          method: "PUT",
          headers: jsonHeaders(key),
          body: JSON.stringify({ name: "New name" }),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as { name: string }).name).toBe("New name");
    });
  });

  describe("versioning corner cases", () => {
    it("accumulates history across PUT+PATCH; versions list ascending; single-version fetch works", async () => {
      const key = await newUserKey();
      const doc = await createDoc(key, { json_data: { rev: 1 } });
      const byId = await import("@/app/api/documents/[id]/route");

      const put = await byId.PUT(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PUT",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { rev: 2 } }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(put.status).toBe(200);

      const patch = await byId.PATCH(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { extra: true } }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(patch.status).toBe(200);
      const latest = (await patch.json()) as DocWire;
      expect(latest.version).toBe(3);
      expect(latest.json_data).toEqual({ rev: 2, extra: true });

      const versionsMod = await import(
        "@/app/api/documents/[id]/versions/route"
      );
      const listRes = await versionsMod.GET(
        new Request(`http://test/api/documents/${doc.id}/versions`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(listRes.status).toBe(200);
      const versions = (await listRes.json()) as Array<{
        document_id: string;
        version: number;
        json_data: unknown;
      }>;
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
      expect(versions[0].json_data).toEqual({ rev: 1 });
      expect(versions[1].json_data).toEqual({ rev: 2 });
      expect(versions.every((v) => v.document_id === doc.id)).toBe(true);

      const oneMod = await import(
        "@/app/api/documents/[id]/versions/[version]/route"
      );
      const v2 = await oneMod.GET(
        new Request(`http://test/api/documents/${doc.id}/versions/2`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: doc.id, version: "2" }) },
      );
      expect(v2.status).toBe(200);
      expect(
        ((await v2.json()) as { json_data: unknown }).json_data,
      ).toEqual({ rev: 2 });

      const notInt = await oneMod.GET(
        new Request(`http://test/api/documents/${doc.id}/versions/abc`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: doc.id, version: "abc" }) },
      );
      expect(notInt.status).toBe(400);

      const missing = await oneMod.GET(
        new Request(`http://test/api/documents/${doc.id}/versions/99`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: doc.id, version: "99" }) },
      );
      expect(missing.status).toBe(404);
    });

    it("toggling is_public alone does not bump the version or snapshot", async () => {
      const key = await newUserKey();
      const doc = await createDoc(key, { json_data: { stay: 1 } });
      const byId = await import("@/app/api/documents/[id]/route");

      const res = await byId.PUT(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PUT",
          headers: jsonHeaders(key),
          body: JSON.stringify({ is_public: true }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(200);
      const updated = (await res.json()) as DocWire;
      expect(updated.is_public).toBe(true);
      expect(updated.version).toBe(1);
      expect(
        await prisma.documentVersion.count({ where: { documentId: doc.id } }),
      ).toBe(0);
    });

    it("PATCH with json_data: null is a no-op (no bump, data unchanged)", async () => {
      const key = await newUserKey();
      const doc = await createDoc(key, { json_data: { keep: true } });
      const byId = await import("@/app/api/documents/[id]/route");
      const res = await byId.PATCH(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: null }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as DocWire;
      expect(body.version).toBe(1);
      expect(body.json_data).toEqual({ keep: true });
    });

    it("version history honors the read guard (public open, private locked)", async () => {
      const key = await newUserKey();
      const pub = await createDoc(key, {
        json_data: { v: 1 },
        is_public: true,
      });
      const priv = await createDoc(key, { json_data: { v: 1 } });
      const versionsMod = await import(
        "@/app/api/documents/[id]/versions/route"
      );

      const openRes = await versionsMod.GET(
        new Request(`http://test/api/documents/${pub.id}/versions`, {
          headers: jsonHeaders(),
        }),
        { params: Promise.resolve({ id: pub.id }) },
      );
      expect(openRes.status).toBe(200);
      expect(await openRes.json()).toEqual([]);

      const lockedRes = await versionsMod.GET(
        new Request(`http://test/api/documents/${priv.id}/versions`, {
          headers: jsonHeaders(),
        }),
        { params: Promise.resolve({ id: priv.id }) },
      );
      expect(lockedRes.status).toBe(401);
    });

    it("deleting a document cascades its version history", async () => {
      const key = await newUserKey();
      const doc = await createDoc(key, { json_data: { n: 1 } });
      const byId = await import("@/app/api/documents/[id]/route");
      await byId.PUT(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PUT",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { n: 2 } }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(
        await prisma.documentVersion.count({ where: { documentId: doc.id } }),
      ).toBe(1);

      const del = await byId.DELETE(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "DELETE",
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(del.status).toBe(204);
      expect(
        await prisma.documentVersion.count({ where: { documentId: doc.id } }),
      ).toBe(0);

      const gone = await byId.GET(
        new Request(`http://test/api/documents/${doc.id}`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(gone.status).toBe(404);
    });
  });

  describe("template enforcement depth", () => {
    const nameSchema = {
      type: "object",
      properties: { name: { type: "string" }, count: { type: "number" } },
      required: ["name"],
      additionalProperties: true,
    };

    it("a PATCH whose *merged* result violates the template is rejected atomically", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Strict");
      expect((await putTemplate(key, wsId, nameSchema)).status).toBe(200);

      const doc = await createDoc(key, {
        json_data: { name: "ok", count: 1 },
        workspace_id: wsId,
      });

      const byId = await import("@/app/api/documents/[id]/route");
      // The patch alone looks harmless, but merged it corrupts `name`.
      const res = await byId.PATCH(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { name: 123 } }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrWire).detail).toContain(
        "does not match workspace template",
      );

      // Atomicity: no snapshot written, no partial update.
      const row = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(row?.version).toBe(1);
      expect(row?.jsonData).toEqual({ name: "ok", count: 1 });
      expect(
        await prisma.documentVersion.count({ where: { documentId: doc.id } }),
      ).toBe(0);

      // A merged-valid patch still goes through.
      const ok = await byId.PATCH(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { count: 2 } }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as DocWire).json_data).toEqual({
        name: "ok",
        count: 2,
      });
    });

    it("a PUT replacement that violates the template is rejected", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Strict PUT");
      await putTemplate(key, wsId, nameSchema);
      const doc = await createDoc(key, {
        json_data: { name: "ok" },
        workspace_id: wsId,
      });

      const byId = await import("@/app/api/documents/[id]/route");
      const res = await byId.PUT(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PUT",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { count: 5 } }), // missing required name
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(400);
      const row = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(row?.version).toBe(1);
    });

    it("uploading a non-schema is rejected with 400 Invalid JSON Schema", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Bad schema");
      const res = await putTemplate(key, wsId, { type: "banana" });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrWire).detail).toMatch(
        /^Invalid JSON Schema:/,
      );
    });

    it("GET/DELETE of a nonexistent template both 404", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "No template");
      const tpl = await import("@/app/api/workspaces/[id]/template/route");

      const get = await tpl.GET(
        new Request(`http://test/api/workspaces/${wsId}/template`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(get.status).toBe(404);

      const del = await tpl.DELETE(
        new Request(`http://test/api/workspaces/${wsId}/template`, {
          method: "DELETE",
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(del.status).toBe(404);
    });

    it("deleting the template lifts enforcement", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Lifted");
      await putTemplate(key, wsId, nameSchema);
      await createDoc(key, { json_data: { name: 1 }, workspace_id: wsId }, 400);

      const tpl = await import("@/app/api/workspaces/[id]/template/route");
      const del = await tpl.DELETE(
        new Request(`http://test/api/workspaces/${wsId}/template`, {
          method: "DELETE",
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(del.status).toBe(204);

      // The same violating document is now accepted.
      await createDoc(key, { json_data: { name: 1 }, workspace_id: wsId }, 201);
    });

    it("replacing an existing template (upsert) tightens future validation", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Replace");
      await putTemplate(key, wsId, { type: "object" });
      await createDoc(key, { json_data: { free: true }, workspace_id: wsId });

      const res = await putTemplate(key, wsId, nameSchema);
      expect(res.status).toBe(200);
      await createDoc(key, { json_data: { free: true }, workspace_id: wsId }, 400);
      await createDoc(key, { json_data: { name: "ok" }, workspace_id: wsId }, 201);
    });

    // Regression for the shared-Ajv `$id` cache bug: a template that declares
    // `$id` must keep working on every request, not just the first one.
    it("a template carrying $id validates repeatedly and can be re-uploaded", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Dollar-id");
      const schema = {
        $id: `https://stashjson.test/schemas/${wsId}`,
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      };
      expect((await putTemplate(key, wsId, schema)).status).toBe(200);
      // Re-upload of the same schema must not 400 with "already exists".
      expect((await putTemplate(key, wsId, schema)).status).toBe(200);

      // Every document is validated with a fresh read of the stored schema.
      await createDoc(key, { json_data: { name: "one" }, workspace_id: wsId });
      await createDoc(key, { json_data: { name: "two" }, workspace_id: wsId });
      await createDoc(key, { json_data: { name: 3 }, workspace_id: wsId }, 400);
    });

    it("deleting the workspace cascades the template but keeps documents", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Cascade tpl");
      await putTemplate(key, wsId, { type: "object" });
      const doc = await createDoc(key, { json_data: {}, workspace_id: wsId });

      const wsById = await import("@/app/api/workspaces/[id]/route");
      const del = await wsById.DELETE(
        new Request(`http://test/api/workspaces/${wsId}`, {
          method: "DELETE",
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(del.status).toBe(204);

      expect(
        await prisma.workspaceTemplate.findUnique({ where: { workspaceId: wsId } }),
      ).toBeNull();
      const survivor = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(survivor?.workspaceId).toBeNull();
    });
  });

  describe("workspace document listing & pagination", () => {
    it("lists newest-first, scoped to the workspace, with a working `after` cursor", async () => {
      const key = await newUserKey();
      const wsId = await createWorkspace(key, "Paged");
      const otherWs = await createWorkspace(key, "Other");

      const oldest = await createDoc(key, { json_data: { n: 1 }, workspace_id: wsId });
      const middle = await createDoc(key, { json_data: { n: 2 }, workspace_id: wsId });
      const newest = await createDoc(key, { json_data: { n: 3 }, workspace_id: wsId });
      const foreign = await createDoc(key, { json_data: { n: 0 }, workspace_id: otherWs });

      // Force unambiguous createdAt ordering (POSTs can land in the same ms).
      await prisma.document.update({
        where: { id: oldest.id },
        data: { createdAt: new Date("2026-01-01T00:00:00Z") },
      });
      await prisma.document.update({
        where: { id: middle.id },
        data: { createdAt: new Date("2026-01-02T00:00:00Z") },
      });
      await prisma.document.update({
        where: { id: newest.id },
        data: { createdAt: new Date("2026-01-03T00:00:00Z") },
      });

      const { GET } = await import("@/app/api/workspaces/[id]/documents/route");
      const page1 = await GET(
        new Request(`http://test/api/workspaces/${wsId}/documents`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(page1.status).toBe(200);
      const docs1 = (await page1.json()) as DocWire[];
      expect(docs1.map((d) => d.id)).toEqual([newest.id, middle.id, oldest.id]);
      expect(docs1.some((d) => d.id === foreign.id)).toBe(false);

      const page2 = await GET(
        new Request(
          `http://test/api/workspaces/${wsId}/documents?after=${middle.id}`,
          { headers: jsonHeaders(key) },
        ),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(page2.status).toBe(200);
      const docs2 = (await page2.json()) as DocWire[];
      expect(docs2.map((d) => d.id)).toEqual([oldest.id]);

      // A cursor that isn't in this workspace is rejected.
      const badCursor = await GET(
        new Request(
          `http://test/api/workspaces/${wsId}/documents?after=${foreign.id}`,
          { headers: jsonHeaders(key) },
        ),
        { params: Promise.resolve({ id: wsId }) },
      );
      expect(badCursor.status).toBe(404);
    });

    // KNOWN BUG (documented, expected to fail until fixed): the cursor filters
    // on `createdAt < cursor.createdAt` alone, so any sibling document sharing
    // the cursor's exact createdAt is silently skipped and can never be paged
    // to. Fix at the root: order and cut on a composite (createdAt, id) — e.g.
    // Prisma `cursor: { id: after }, skip: 1` with
    // `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`.
    it.fails(
      "paginating after a document does not skip siblings created at the same instant",
      async () => {
        const key = await newUserKey();
        const wsId = await createWorkspace(key, "Tied timestamps");
        const a = await createDoc(key, { json_data: { t: "a" }, workspace_id: wsId });
        const b = await createDoc(key, { json_data: { t: "b" }, workspace_id: wsId });
        const tied = new Date("2026-02-02T02:02:02.000Z");
        await prisma.document.update({ where: { id: a.id }, data: { createdAt: tied } });
        await prisma.document.update({ where: { id: b.id }, data: { createdAt: tied } });

        const { GET } = await import(
          "@/app/api/workspaces/[id]/documents/route"
        );
        const page1 = await GET(
          new Request(`http://test/api/workspaces/${wsId}/documents`, {
            headers: jsonHeaders(key),
          }),
          { params: Promise.resolve({ id: wsId }) },
        );
        const docs1 = (await page1.json()) as DocWire[];
        expect(docs1).toHaveLength(2);

        const page2 = await GET(
          new Request(
            `http://test/api/workspaces/${wsId}/documents?after=${docs1[0].id}`,
            { headers: jsonHeaders(key) },
          ),
          { params: Promise.resolve({ id: wsId }) },
        );
        const docs2 = (await page2.json()) as DocWire[];
        // The sibling sharing the timestamp must still be reachable.
        expect(docs2.map((d) => d.id)).toContain(docs1[1].id);
      },
    );
  });

  describe("key management is session-only", () => {
    it("an API key cannot list or mint keys (cookie required)", async () => {
      const key = await newUserKey();
      const keysMod = await import("@/app/api/keys/route");

      const list = await keysMod.GET(
        new Request("http://test/api/keys", { headers: jsonHeaders(key) }),
      );
      expect(list.status).toBe(401);

      const mint = await keysMod.POST(
        new Request("http://test/api/keys", {
          method: "POST",
          headers: jsonHeaders(key),
          body: JSON.stringify({ name: "Should fail" }),
        }),
      );
      expect(mint.status).toBe(401);
    });

    it("revoking another user's key id 404s and leaves it active", async () => {
      const cookieA = await signUpSession("key-owner@test.local");
      const cookieB = await signUpSession("key-thief@test.local");

      const keysMod = await import("@/app/api/keys/route");
      const created = await keysMod.POST(
        new Request("http://test/api/keys", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: cookieA },
          body: JSON.stringify({ name: "A's key" }),
        }),
      );
      expect(created.status).toBe(201);
      const { key } = (await created.json()) as { key: { id: string } };

      const revokeMod = await import("@/app/api/keys/[id]/route");
      const res = await revokeMod.DELETE(
        new Request(`http://test/api/keys/${key.id}`, {
          method: "DELETE",
          headers: { "content-type": "application/json", cookie: cookieB },
        }),
        { params: Promise.resolve({ id: key.id }) },
      );
      expect(res.status).toBe(404);

      const row = await prisma.apiKey.findUnique({ where: { id: key.id } });
      expect(row?.revokedAt).toBeNull();
    });
  });

  describe("JSON payload fidelity", () => {
    it("round-trips unicode, nulls, arrays, and deep nesting byte-for-byte", async () => {
      const key = await newUserKey();
      const payload = {
        "héllo wörld 👋": "üñíçødé ✓",
        empty_obj: {},
        empty_arr: [],
        null_value: null,
        numbers: [0, -1, 3.14159, 1e21],
        bools: [true, false],
        deep: { a: { b: { c: { d: { e: ["leaf", null, { f: 6 }] } } } } },
      };
      const doc = await createDoc(key, { json_data: payload });

      const byId = await import("@/app/api/documents/[id]/route");
      const res = await byId.GET(
        new Request(`http://test/api/documents/${doc.id}`, {
          headers: jsonHeaders(key),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as DocWire).json_data).toEqual(payload);
    });

    it("PATCH merging a null value keeps the key with a null (shallow merge)", async () => {
      const key = await newUserKey();
      const doc = await createDoc(key, {
        json_data: { keep: "yes", drop: "soon" },
      });
      const byId = await import("@/app/api/documents/[id]/route");
      const res = await byId.PATCH(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { drop: null } }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(res.status).toBe(200);
      // Shallow-merge semantics: keys cannot be deleted, only overwritten.
      expect(((await res.json()) as DocWire).json_data).toEqual({
        keep: "yes",
        drop: null,
      });
    });

    it("PATCH replaces nested objects wholesale (shallow, not deep, merge)", async () => {
      const key = await newUserKey();
      const doc = await createDoc(key, {
        json_data: { nested: { a: 1, b: 2 }, top: true },
      });
      const byId = await import("@/app/api/documents/[id]/route");
      const res = await byId.PATCH(
        new Request(`http://test/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: jsonHeaders(key),
          body: JSON.stringify({ json_data: { nested: { b: 20 } } }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      expect(((await res.json()) as DocWire).json_data).toEqual({
        nested: { b: 20 }, // `a` is gone: nested objects are not deep-merged
        top: true,
      });
    });
  });

  describe("health", () => {
    it("GET /api/health reports healthy without auth", async () => {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "healthy" });
    });
  });
});
