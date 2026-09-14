import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { AccessEntry } from "@/lib/accessLog";

/**
 * The access-log wrapper and stash (ADR-0002), with the database and Next's
 * `after()` mocked: what a row contains, that it is written only after the
 * response, and that a failed write changes nothing for the caller. Whether
 * the guards record the right actor/owner on real reads is covered against a
 * real Postgres in tests/integration/accessLog.test.ts.
 */

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";

// Hoisted with the mocks: `next/server` is imported statically above, so its
// factory runs before ordinary top-level `const`s would be initialised.
const { create, deferred, after } = vi.hoisted(() => {
  const create = vi.fn<(args: { data: AccessEntry }) => Promise<unknown>>();
  // `after()` queues the task instead of running it, so a test can observe
  // the gap between the response returning and the row being written.
  const deferred: Array<() => Promise<void>> = [];
  const after = vi.fn((task: () => Promise<void>) => {
    deferred.push(task);
  });
  return { create, deferred, after };
});

vi.mock("@/lib/db", () => ({ prisma: { accessLog: { create } } }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after };
});

const flush = async () => {
  for (const task of deferred.splice(0)) await task();
};

const written = (): AccessEntry => {
  expect(create).toHaveBeenCalledTimes(1);
  return create.mock.calls[0][0].data;
};

beforeEach(() => {
  vi.clearAllMocks();
  deferred.length = 0;
  create.mockResolvedValue({});
});

describe("withAccessLog", () => {
  it("writes method, route literal, path, status and duration after the response", async () => {
    const { withAccessLog } = await import("@/lib/accessLog");
    const handler = withAccessLog("/api/documents/[id]", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return NextResponse.json({ ok: true }, { status: 200 });
    });

    const res = await handler(
      new Request("http://test/api/documents/abc123", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Scheduled, not yet written: the caller never waits on the insert.
    expect(after).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();

    await flush();
    const row = written();
    expect(row).toMatchObject({
      method: "GET",
      route: "/api/documents/[id]",
      path: "/api/documents/abc123",
      status: 200,
      credential: "none",
      actorUserId: null,
      ownerUserId: null,
      apiKeyId: null,
      documentId: null,
      workspaceId: null,
    });
    expect(row.durationMs).toBeGreaterThanOrEqual(4);
    expect(Number.isInteger(row.durationMs)).toBe(true);
  });

  it("records the status the handler actually returned, including errors", async () => {
    const { withAccessLog } = await import("@/lib/accessLog");
    for (const status of [401, 404, 429]) {
      create.mockClear();
      const handler = withAccessLog("/api/documents/[id]", async () =>
        NextResponse.json({ detail: "nope" }, { status }),
      );
      await handler(new Request("http://test/api/documents/x"));
      await flush();
      expect(written().status).toBe(status);
    }
  });

  it("stores the path only — never the query string — and bounds its length", async () => {
    const { withAccessLog, MAX_PATH_LENGTH } = await import("@/lib/accessLog");
    const handler = withAccessLog("/api/documents/[id]", async () =>
      new Response(null, { status: 204 }),
    );

    await handler(
      new Request("http://test/api/documents/abc?api_key=secret&x=1#frag"),
    );
    await flush();
    expect(written().path).toBe("/api/documents/abc");

    create.mockClear();
    const long = "/api/documents/" + "a".repeat(MAX_PATH_LENGTH * 2);
    await handler(new Request(`http://test${long}`));
    await flush();
    expect(written().path).toBe(long.slice(0, MAX_PATH_LENGTH));
    expect(written().path.length).toBe(MAX_PATH_LENGTH);
  });

  it("folds in facts recorded during the request", async () => {
    const { withAccessLog, recordAccess } = await import("@/lib/accessLog");
    const handler = withAccessLog("/api/documents/[id]", async (req: Request) => {
      recordAccess(req, {
        credential: "api_key",
        actorUserId: "u1",
        apiKeyId: "k1",
      });
      recordAccess(req, { ownerUserId: "u2", documentId: "d1", workspaceId: "w1" });
      return new Response("ok");
    });

    await handler(new Request("http://test/api/documents/d1"));
    await flush();
    expect(written()).toMatchObject({
      credential: "api_key",
      actorUserId: "u1",
      apiKeyId: "k1",
      ownerUserId: "u2",
      documentId: "d1",
      workspaceId: "w1",
    });
  });

  it("logs and swallows a failed insert; the response is unaffected", async () => {
    const { withAccessLog } = await import("@/lib/accessLog");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValue(new Error("db down"));

    const handler = withAccessLog("/api/documents/[id]", async () =>
      NextResponse.json({ ok: true }),
    );
    const res = await handler(new Request("http://test/api/documents/d1"));
    expect(res.status).toBe(200);

    await expect(flush()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Access log write failed"),
      expect.any(Error),
    );
    error.mockRestore();
  });

  it("runs the write detached when there is no Next request scope", async () => {
    const { withAccessLog } = await import("@/lib/accessLog");
    after.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const handler = withAccessLog("/api/documents/[id]", async () =>
      new Response("ok"),
    );

    const res = await handler(new Request("http://test/api/documents/d1"));
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(deferred).toHaveLength(0);
  });
});

describe("recordAccess", () => {
  it("merges across calls, later keys winning, and defaults the rest", async () => {
    const { recordAccess, recordedAccess } = await import("@/lib/accessLog");
    const req = new Request("http://test/api/documents/d1");

    expect(recordedAccess(req)).toEqual({
      credential: "none",
      actorUserId: null,
      ownerUserId: null,
      apiKeyId: null,
      documentId: null,
      workspaceId: null,
    });

    recordAccess(req, { ownerUserId: "u2", documentId: "d1" });
    recordAccess(req, { credential: "session", actorUserId: "u1" });
    recordAccess(req, { documentId: "d1-again" });

    expect(recordedAccess(req)).toEqual({
      credential: "session",
      actorUserId: "u1",
      ownerUserId: "u2",
      apiKeyId: null,
      documentId: "d1-again",
      workspaceId: null,
    });
  });

  it("keeps each request's facts separate", async () => {
    const { recordAccess, recordedAccess } = await import("@/lib/accessLog");
    const a = new Request("http://test/api/documents/a");
    const b = new Request("http://test/api/documents/b");
    recordAccess(a, { ownerUserId: "owner-a" });
    expect(recordedAccess(b).ownerUserId).toBeNull();
  });
});
