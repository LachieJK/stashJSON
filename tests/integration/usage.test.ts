import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The Usage page's access-log aggregates against a real Postgres: traffic
 * buckets, the hero summary and the two warnings (#62), then the hourly
 * counts behind the heatmap and the per-resource rows (#63), and the actors
 * and paginated entries (#64). Rows are inserted
 * straight into `access_logs` with chosen timestamps, since the rules under
 * test are about *when* and *what* was logged, not how it got there.
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
    "[integration] Skipping usage aggregate tests: set TEST_DATABASE_URL to a " +
      "throwaway (non-Neon) Postgres to enable them.",
  );
}
if (enabled) {
  process.env.DATABASE_URL = testDbUrl;
}

type Credential = import("@/prisma/generated/enums").Credential;

describe.skipIf(!enabled)("usage aggregates (DB-backed)", () => {
  let prisma: import("@/prisma/generated/client").PrismaClient;
  let usage: typeof import("@/lib/usage");
  const createdUserIds: string[] = [];

  const NOW = new Date("2026-09-16T12:00:00Z");
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
  const hoursAgo = (h: number) => minutesAgo(h * 60);

  async function newUser(label: string) {
    const { randomUUID } = await import("node:crypto");
    const user = await prisma.user.create({
      data: { name: label, email: `usage_${label}_${randomUUID()}@stashjson.local` },
    });
    createdUserIds.push(user.id);
    return user;
  }

  type Entry = {
    at: Date;
    status: number;
    credential?: Credential;
    actorUserId?: string | null;
    apiKeyId?: string | null;
    documentId?: string | null;
    workspaceId?: string | null;
    method?: string;
    path?: string;
    durationMs?: number;
  };

  /** Insert entries owned by `ownerId`. Defaults: an anonymous public read. */
  async function log(ownerId: string, entries: Entry[]) {
    await prisma.accessLog.createMany({
      data: entries.map((e) => ({
        at: e.at,
        method: e.method ?? "GET",
        route: "/api/documents/[id]",
        path: e.path ?? `/api/documents/${e.documentId ?? "doc"}`,
        status: e.status,
        durationMs: e.durationMs ?? 5,
        credential: e.credential ?? "none",
        actorUserId: e.actorUserId ?? null,
        ownerUserId: ownerId,
        apiKeyId: e.apiKeyId ?? null,
        documentId: e.documentId ?? null,
        workspaceId: e.workspaceId ?? null,
      })),
    });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    usage = await import("@/lib/usage");
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdUserIds.length) {
      await prisma.accessLog.deleteMany({ where: { ownerUserId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  describe("trafficBuckets", () => {
    it("returns every bucket with zeros, and an entry at the exact range start in bucket 0", async () => {
      const owner = await newUser("buckets");
      await log(owner.id, [
        { at: hoursAgo(1), status: 200 }, // exact range start
        { at: minutesAgo(1), status: 200 }, // inside the last bucket
        { at: hoursAgo(1.5), status: 200 }, // before the range: excluded
        { at: NOW, status: 200 }, // at now: the range is half-open, excluded
      ]);
      const buckets = await usage.trafficBuckets(
        { userId: owner.id, range: "1h", cred: "all", resource: null },
        NOW,
      );
      expect(buckets).toHaveLength(12);
      expect(buckets[0].start.toISOString()).toBe("2026-09-16T11:00:00.000Z");
      expect(buckets[11].start.toISOString()).toBe("2026-09-16T11:55:00.000Z");
      expect(buckets.map((b) => b.total)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
      expect(buckets[1]).toEqual({
        start: new Date("2026-09-16T11:05:00Z"),
        counts: { "2xx": 0, "4xx": 0, "429": 0, "5xx": 0 },
        total: 0,
        peakRpm: 0,
      });
    });

    it("counts by status class — 429 is never a 4xx — and reports peak req/min per bucket", async () => {
      const owner = await newUser("classes");
      await log(owner.id, [
        // Bucket 0 (11:00–11:05): three in one minute, one in the next.
        { at: minutesAgo(59), status: 200 },
        { at: minutesAgo(59), status: 404 },
        { at: minutesAgo(59), status: 429 },
        { at: minutesAgo(58), status: 503 },
        // Bucket 11 (11:55–12:00): two in the same minute.
        { at: minutesAgo(2), status: 401 },
        { at: minutesAgo(2), status: 429 },
      ]);
      const buckets = await usage.trafficBuckets(
        { userId: owner.id, range: "1h", cred: "all", resource: null },
        NOW,
      );
      expect(buckets[0]).toMatchObject({
        counts: { "2xx": 1, "4xx": 1, "429": 1, "5xx": 1 },
        total: 4,
        peakRpm: 3,
      });
      expect(buckets[11]).toMatchObject({
        counts: { "2xx": 0, "4xx": 1, "429": 1, "5xx": 0 },
        total: 2,
        peakRpm: 2,
      });
    });

    it("scopes to the owner, the credential, and a document-or-workspace resource", async () => {
      const owner = await newUser("scoped");
      const other = await newUser("scoped-other");
      await log(owner.id, [
        { at: minutesAgo(10), status: 200, credential: "api_key", documentId: "d1", workspaceId: "w1" },
        { at: minutesAgo(10), status: 200, credential: "none", documentId: "d2", workspaceId: "w1" },
        { at: minutesAgo(10), status: 200, credential: "session", documentId: "d3", workspaceId: "w2" },
      ]);
      await log(other.id, [{ at: minutesAgo(10), status: 200, documentId: "d1", workspaceId: "w1" }]);

      const total = async (f: Partial<import("@/lib/usage").TrafficQuery>) =>
        (
          await usage.trafficBuckets(
            { userId: owner.id, range: "1h", cred: "all", resource: null, ...f },
            NOW,
          )
        ).reduce((n, b) => n + b.total, 0);

      expect(await total({})).toBe(3);
      expect(await total({ cred: "none" })).toBe(1);
      expect(await total({ resource: "d1" })).toBe(1);
      expect(await total({ resource: "w1" })).toBe(2);
      expect(await total({ resource: "w1", cred: "api_key" })).toBe(1);
    });
  });

  describe("summary", () => {
    it("totals the range, counts errors (4xx + 5xx, not 429) and 429s, and rates the trailing hour", async () => {
      const owner = await newUser("summary");
      await log(owner.id, [
        { at: hoursAgo(20), status: 200 },
        { at: hoursAgo(20), status: 404 },
        { at: hoursAgo(20), status: 500 },
        { at: hoursAgo(20), status: 429 },
        { at: minutesAgo(30), status: 200 },
        { at: minutesAgo(30), status: 429 },
        { at: hoursAgo(25), status: 200 }, // outside 24h
      ]);
      await expect(
        usage.summary({ userId: owner.id, range: "24h", cred: "all", resource: null }, NOW),
      ).resolves.toEqual({ total: 6, errors: 2, throttled: 2, lastHour: 2 });
    });

    it("applies the credential and resource filters to the trailing hour too", async () => {
      const owner = await newUser("summary-scoped");
      await log(owner.id, [
        { at: minutesAgo(5), status: 200, credential: "api_key", documentId: "d1" },
        { at: minutesAgo(5), status: 200, credential: "none", documentId: "d2" },
      ]);
      await expect(
        usage.summary({ userId: owner.id, range: "7d", cred: "none", resource: "d2" }, NOW),
      ).resolves.toEqual({ total: 1, errors: 0, throttled: 0, lastHour: 1 });
    });
  });

  describe("warnings", () => {
    const refused = (n: number, documentId: string, extra: Partial<Entry> = {}): Entry[] =>
      Array.from({ length: n }, (_, i) => ({
        at: minutesAgo(1 + (i % 50)),
        status: ([401, 403, 404] as const)[i % 3],
        documentId,
        workspaceId: "w1",
        ...extra,
      }));

    it("flags a resource as probed at PROBE_THRESHOLD refused requests, not one below", async () => {
      expect(usage.PROBE_THRESHOLD).toBe(20);
      const owner = await newUser("probed");
      await log(owner.id, [
        ...refused(19, "quiet"),
        ...refused(20, "noisy"),
        // A 200 on the noisy document is not refused and does not count.
        { at: minutesAgo(1), status: 200, documentId: "noisy" },
      ]);
      const w = await usage.warnings(owner.id, NOW);
      expect(w.probed).toEqual([{ resourceId: "noisy", refused: 20, distinctActors: 1 }]);
    });

    it("only counts the trailing hour, and counts anonymous callers as one source", async () => {
      const owner = await newUser("probed-window");
      const stranger = await newUser("stranger");
      await log(owner.id, [
        ...refused(19, "d1"),
        { at: hoursAgo(1.01), status: 401, documentId: "d1", workspaceId: "w1" },
      ]);
      expect((await usage.warnings(owner.id, NOW)).probed).toEqual([]);

      await log(owner.id, [
        { at: minutesAgo(2), status: 403, documentId: "d1", workspaceId: "w1", credential: "api_key", actorUserId: stranger.id },
      ]);
      expect((await usage.warnings(owner.id, NOW)).probed).toEqual([
        { resourceId: "d1", refused: 20, distinctActors: 2 },
      ]);
    });

    it("attributes a refused request with no document to its workspace", async () => {
      const owner = await newUser("probed-ws");
      await log(owner.id, refused(20, "unused", { documentId: null, workspaceId: "ws-9" }));
      expect((await usage.warnings(owner.id, NOW)).probed).toEqual([
        { resourceId: "ws-9", refused: 20, distinctActors: 1 },
      ]);
    });

    it("counts a stranger's 429 on a public read as the owner being throttled", async () => {
      const owner = await newUser("throttled");
      const stranger = await newUser("throttled-stranger");
      await log(owner.id, [
        { at: minutesAgo(3), status: 429, credential: "none", documentId: "pub" },
        { at: minutesAgo(3), status: 429, credential: "api_key", actorUserId: stranger.id, documentId: "pub" },
        { at: hoursAgo(2), status: 429, documentId: "pub" }, // outside the hour
      ]);
      expect((await usage.warnings(owner.id, NOW)).throttled).toBe(2);
      expect((await usage.warnings(stranger.id, NOW)).throttled).toBe(0);
    });

    it("ignores the page filters: warnings take only the owner", async () => {
      const owner = await newUser("unfiltered");
      await log(owner.id, [
        ...refused(20, "d1", { credential: "api_key" }),
        { at: minutesAgo(1), status: 429, credential: "session", documentId: "d2" },
      ]);
      // Deliberately no range / cred / resource: the signature does not take them.
      const w = await usage.warnings(owner.id, NOW);
      expect(w).toEqual({
        probed: [{ resourceId: "d1", refused: 20, distinctActors: 1 }],
        throttled: 1,
      });
    });
  });
  describe("hourlyCounts", () => {
    it("returns only the non-empty UTC hours, in order, within the range", async () => {
      const owner = await newUser("hourly");
      await log(owner.id, [
        { at: new Date("2026-09-16T09:10:00Z"), status: 200 },
        { at: new Date("2026-09-16T09:50:00Z"), status: 404 },
        { at: new Date("2026-09-16T11:59:00Z"), status: 200 },
        { at: new Date("2026-09-15T11:30:00Z"), status: 200 }, // before the 24h range
      ]);
      const rows = await usage.hourlyCounts(
        { userId: owner.id, range: "24h", cred: "all", resource: null },
        NOW,
      );
      expect(rows).toEqual([
        { hourUtc: new Date("2026-09-16T09:00:00Z"), count: 2 },
        { hourUtc: new Date("2026-09-16T11:00:00Z"), count: 1 },
      ]);
    });

    it("includes workspace-level entries (no document) under a workspace-id resource filter", async () => {
      const owner = await newUser("hourly-ws");
      await log(owner.id, [
        { at: minutesAgo(5), status: 200, documentId: "d1", workspaceId: "w1" },
        { at: minutesAgo(5), status: 201, documentId: null, workspaceId: "w1" }, // POST /workspaces/w1/documents
        { at: minutesAgo(5), status: 200, documentId: "d2", workspaceId: "w2" },
      ]);
      const rows = await usage.hourlyCounts(
        { userId: owner.id, range: "1h", cred: "all", resource: "w1" },
        NOW,
      );
      expect(rows.reduce((n, r) => n + r.count, 0)).toBe(2);
    });
  });

  describe("resourceRows", () => {
    async function ownedWorkspace(userId: string, name: string) {
      return prisma.workspace.create({ data: { userId, name } });
    }
    async function ownedDocument(userId: string, workspaceId: string | null, isPublic = false) {
      const { generateDocumentId } = await import("@/lib/utils");
      return prisma.document.create({
        data: { id: generateDocumentId(), userId, workspaceId, isPublic, jsonData: {} },
      });
    }
    const noProbes = { probed: [], throttled: 0 };

    it("groups documents under their workspace with totals, refused counts, a series and flags", async () => {
      const owner = await newUser("rows");
      const ws = await ownedWorkspace(owner.id, "Blog");
      const pub = await ownedDocument(owner.id, ws.id, true);
      const priv = await ownedDocument(owner.id, ws.id);
      await log(owner.id, [
        { at: minutesAgo(50), status: 200, documentId: pub.id, workspaceId: ws.id },
        { at: minutesAgo(2), status: 200, documentId: pub.id, workspaceId: ws.id },
        { at: minutesAgo(2), status: 403, documentId: priv.id, workspaceId: ws.id },
        { at: minutesAgo(2), status: 401, documentId: priv.id, workspaceId: ws.id },
        { at: minutesAgo(2), status: 500, documentId: priv.id, workspaceId: ws.id },
        // Workspace-level: counts for the workspace, not for any document.
        { at: minutesAgo(2), status: 201, documentId: null, workspaceId: ws.id },
      ]);
      const rows = await usage.resourceRows(
        { userId: owner.id, range: "1h", cred: "all", resource: null },
        { probed: [{ resourceId: priv.id, refused: 20, distinctActors: 1 }], throttled: 0 },
        NOW,
      );
      expect(rows).toEqual([
        {
          id: ws.id,
          name: "Blog",
          exists: true,
          total: 6,
          refused: 2,
          probed: false,
          documents: [
            {
              id: priv.id,
              exists: true,
              isPublic: false,
              probed: true,
              total: 3,
              refused: 2,
              series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
            },
            {
              id: pub.id,
              exists: true,
              isPublic: true,
              probed: false,
              total: 2,
              refused: 0,
              series: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            },
          ],
        },
      ]);
    });

    it("keeps a deleted document (and a deleted workspace) that still has rows in range", async () => {
      const owner = await newUser("rows-deleted");
      const ws = await ownedWorkspace(owner.id, "Gone");
      const doc = await ownedDocument(owner.id, ws.id);
      await log(owner.id, [
        { at: minutesAgo(3), status: 200, documentId: doc.id, workspaceId: ws.id },
      ]);
      await prisma.document.delete({ where: { id: doc.id } });
      const [row] = await usage.resourceRows(
        { userId: owner.id, range: "1h", cred: "all", resource: null },
        noProbes,
        NOW,
      );
      expect(row).toMatchObject({ id: ws.id, name: "Gone", exists: true, total: 1 });
      expect(row.documents).toEqual([
        { id: doc.id, exists: false, isPublic: null, probed: false, total: 1, refused: 0, series: expect.any(Array) },
      ]);

      await prisma.workspace.delete({ where: { id: ws.id } });
      const [gone] = await usage.resourceRows(
        { userId: owner.id, range: "1h", cred: "all", resource: null },
        noProbes,
        NOW,
      );
      expect(gone).toMatchObject({ id: ws.id, name: null, exists: false, total: 1 });
    });

    it("lists documents outside any workspace in a final group with a null id", async () => {
      const owner = await newUser("rows-detached");
      const ws = await ownedWorkspace(owner.id, "Has one");
      const inWs = await ownedDocument(owner.id, ws.id);
      const loose = await ownedDocument(owner.id, null);
      await log(owner.id, [
        { at: minutesAgo(3), status: 200, documentId: inWs.id, workspaceId: ws.id },
        { at: minutesAgo(3), status: 200, documentId: loose.id, workspaceId: null },
        { at: minutesAgo(3), status: 200, documentId: loose.id, workspaceId: null },
      ]);
      const rows = await usage.resourceRows(
        { userId: owner.id, range: "1h", cred: "all", resource: null },
        noProbes,
        NOW,
      );
      // Ordered by total, except the detached group is always last.
      expect(rows.map((r) => [r.id, r.total])).toEqual([
        [ws.id, 1],
        [null, 2],
      ]);
      expect(rows[1].documents[0]).toMatchObject({ id: loose.id, total: 2 });
    });

    it("under a workspace-id filter, counts the workspace's document-less entries too", async () => {
      const owner = await newUser("rows-ws-filter");
      const ws = await ownedWorkspace(owner.id, "Mine");
      const other = await ownedWorkspace(owner.id, "Other");
      const doc = await ownedDocument(owner.id, ws.id);
      await log(owner.id, [
        { at: minutesAgo(3), status: 200, documentId: doc.id, workspaceId: ws.id },
        { at: minutesAgo(3), status: 201, documentId: null, workspaceId: ws.id }, // POST /workspaces/[id]/documents
        { at: minutesAgo(3), status: 200, documentId: null, workspaceId: other.id },
      ]);
      const rows = await usage.resourceRows(
        { userId: owner.id, range: "1h", cred: "all", resource: ws.id },
        noProbes,
        NOW,
      );
      expect(rows.map((r) => [r.id, r.total])).toEqual([[ws.id, 2]]);
      expect(rows[0].documents.map((d) => [d.id, d.total])).toEqual([[doc.id, 1]]);
    });

    it("applies the page filters", async () => {
      const owner = await newUser("rows-filtered");
      const ws = await ownedWorkspace(owner.id, "Filtered");
      const a = await ownedDocument(owner.id, ws.id);
      const b = await ownedDocument(owner.id, ws.id);
      await log(owner.id, [
        { at: minutesAgo(3), status: 200, documentId: a.id, workspaceId: ws.id, credential: "api_key" },
        { at: minutesAgo(3), status: 200, documentId: b.id, workspaceId: ws.id, credential: "none" },
      ]);
      const rows = await usage.resourceRows(
        { userId: owner.id, range: "1h", cred: "none", resource: b.id },
        noProbes,
        NOW,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].total).toBe(1);
      expect(rows[0].documents.map((d) => d.id)).toEqual([b.id]);
    });
  });

  describe("actors", () => {
    async function key(userId: string, name: string, revoked = false) {
      return prisma.apiKey.create({
        data: {
          userId,
          name,
          keyHash: `hash_${name}_${userId}`,
          revokedAt: revoked ? hoursAgo(2) : null,
        },
      });
    }

    it("splits the range into you / other accounts / anonymous, with key rows and handle rows", async () => {
      const owner = await newUser("actors");
      const stranger = await newUser("actors-stranger");
      const other = await newUser("actors-other");
      const prod = await key(owner.id, "prod-api");
      await log(owner.id, [
        // You: two via prod-api, one from the dashboard.
        { at: minutesAgo(30), status: 200, credential: "api_key", actorUserId: owner.id, apiKeyId: prod.id },
        { at: minutesAgo(20), status: 404, credential: "api_key", actorUserId: owner.id, apiKeyId: prod.id },
        { at: minutesAgo(10), status: 200, credential: "session", actorUserId: owner.id },
        // Other accounts: a stranger three times (one refused), another once.
        { at: minutesAgo(9), status: 200, credential: "api_key", actorUserId: stranger.id, apiKeyId: "not-the-owners-key" },
        { at: minutesAgo(8), status: 403, credential: "api_key", actorUserId: stranger.id, apiKeyId: "not-the-owners-key" },
        { at: minutesAgo(7), status: 200, credential: "api_key", actorUserId: stranger.id, apiKeyId: "not-the-owners-key" },
        { at: minutesAgo(6), status: 200, credential: "session", actorUserId: other.id },
        // Anonymous, twice.
        { at: minutesAgo(5), status: 200 },
        { at: minutesAgo(4), status: 401 },
        // Out of range.
        { at: hoursAgo(2), status: 200, credential: "session", actorUserId: owner.id },
      ]);
      const { handleFor } = await import("@/lib/handles");
      const result = await usage.actors(
        { userId: owner.id, range: "1h", cred: "all", resource: null },
        NOW,
      );
      expect(result.totals).toEqual({ you: 3, others: 4, anonymous: 2 });
      expect(result.keys).toEqual([
        { label: "prod-api", revoked: false, total: 2, refused: 1, lastSeen: minutesAgo(20) },
        { label: "dashboard", revoked: false, total: 1, refused: 0, lastSeen: minutesAgo(10) },
      ]);
      expect(result.handles).toEqual([
        { handle: handleFor(owner.id, stranger.id), total: 3, refused: 1, lastSeen: minutesAgo(7) },
        { handle: handleFor(owner.id, other.id), total: 1, refused: 0, lastSeen: minutesAgo(6) },
      ]);
      // No account id of anyone else leaves lib/: assert on the wire shape.
      const wire = JSON.stringify(result);
      expect(wire).not.toContain("actorUserId");
      expect(wire).not.toContain(stranger.id);
      expect(wire).not.toContain(other.id);
    });

    it("still names a revoked key for its historical rows", async () => {
      const owner = await newUser("actors-revoked");
      const old = await key(owner.id, "old-ci", true);
      await log(owner.id, [
        { at: minutesAgo(5), status: 200, credential: "api_key", actorUserId: owner.id, apiKeyId: old.id },
      ]);
      const result = await usage.actors(
        { userId: owner.id, range: "1h", cred: "all", resource: null },
        NOW,
      );
      expect(result.keys).toEqual([
        { label: "old-ci", revoked: true, total: 1, refused: 0, lastSeen: minutesAgo(5) },
      ]);
    });

    it("applies the page filters", async () => {
      const owner = await newUser("actors-filtered");
      const stranger = await newUser("actors-filtered-stranger");
      await log(owner.id, [
        { at: minutesAgo(5), status: 200, credential: "session", actorUserId: stranger.id, documentId: "doc-a" },
        { at: minutesAgo(4), status: 200, documentId: "doc-b" },
      ]);
      const result = await usage.actors(
        { userId: owner.id, range: "1h", cred: "all", resource: "doc-b" },
        NOW,
      );
      expect(result.totals).toEqual({ you: 0, others: 0, anonymous: 1 });
      expect(result.handles).toEqual([]);
    });
  });

  describe("entries", () => {
    const q = (userId: string) => ({ userId, range: "1h" as const, cred: "all" as const, resource: null });

    it("lists the range newest first, with `who` already rendered", async () => {
      const owner = await newUser("entries");
      const stranger = await newUser("entries-stranger");
      const prod = await prisma.apiKey.create({
        data: { userId: owner.id, name: "prod-api", keyHash: `hash_entries_${owner.id}`, revokedAt: hoursAgo(1) },
      });
      await log(owner.id, [
        { at: minutesAgo(4), status: 200, method: "PUT", path: "/api/documents/abc", durationMs: 12, credential: "api_key", actorUserId: owner.id, apiKeyId: prod.id },
        { at: minutesAgo(3), status: 200, credential: "session", actorUserId: owner.id },
        { at: minutesAgo(2), status: 403, credential: "api_key", actorUserId: stranger.id, apiKeyId: "theirs" },
        { at: minutesAgo(1), status: 429 },
        { at: hoursAgo(2), status: 200 }, // out of range
      ]);
      const { handleFor } = await import("@/lib/handles");
      const page = await usage.entries(q(owner.id), null, NOW);
      expect(page.nextCursor).toBeNull();
      expect(page.entries.map((e) => e.who)).toEqual([
        "Anonymous",
        handleFor(owner.id, stranger.id),
        "You · dashboard",
        "You · prod-api",
      ]);
      expect(page.entries[3]).toMatchObject({
        at: minutesAgo(4),
        method: "PUT",
        path: "/api/documents/abc",
        status: 200,
        durationMs: 12,
      });
      expect(JSON.stringify(page)).not.toContain(stranger.id);
    });

    it("pages by (at, id) without overlap or skips, even when every entry shares an `at`", async () => {
      const owner = await newUser("entries-paged");
      const at = minutesAgo(10);
      await log(
        owner.id,
        Array.from({ length: usage.LOG_PAGE_SIZE * 2 + 20 }, () => ({ at, status: 200 })),
      );
      const seen = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: Awaited<ReturnType<typeof usage.entries>> = await usage.entries(q(owner.id), cursor, NOW);
        pages += 1;
        for (const e of page.entries) {
          expect(seen.has(e.id)).toBe(false);
          seen.add(e.id);
        }
        cursor = page.nextCursor;
      } while (cursor);
      expect(pages).toBe(3);
      expect(seen.size).toBe(usage.LOG_PAGE_SIZE * 2 + 20);
    });

    it("does not skip entries whose `at` differs from the cursor's only in microseconds", async () => {
      const owner = await newUser("entries-micros");
      // Straight SQL: a JS Date cannot carry microseconds, and the cursor must.
      const n = usage.LOG_PAGE_SIZE + 2;
      await prisma.$executeRaw`
        INSERT INTO access_logs (id, at, method, route, path, status, duration_ms, credential, owner_user_id)
        SELECT gen_random_uuid()::text,
               '2026-09-16T11:50:00Z'::timestamptz + (i * interval '1 microsecond'),
               'GET', '/api/documents/[id]', '/api/documents/x', 200, 1, 'none', ${owner.id}
        FROM generate_series(1, ${n}) AS i`;
      const first = await usage.entries(q(owner.id), null, NOW);
      expect(first.entries).toHaveLength(usage.LOG_PAGE_SIZE);
      expect(first.nextCursor).not.toBeNull();
      const second = await usage.entries(q(owner.id), first.nextCursor, NOW);
      expect(second.entries).toHaveLength(2);
      expect(second.nextCursor).toBeNull();
      const ids = new Set([...first.entries, ...second.entries].map((e) => e.id));
      expect(ids.size).toBe(n);
    });

    it("treats an unreadable cursor as the first page", async () => {
      const owner = await newUser("entries-badcursor");
      await log(owner.id, [{ at: minutesAgo(1), status: 200 }]);
      const page = await usage.entries(q(owner.id), "not-a-cursor", NOW);
      expect(page.entries).toHaveLength(1);
    });

    it("applies the page filters", async () => {
      const owner = await newUser("entries-filtered");
      await log(owner.id, [
        { at: minutesAgo(2), status: 200, credential: "session", actorUserId: owner.id },
        { at: minutesAgo(1), status: 200 },
      ]);
      const page = await usage.entries({ ...q(owner.id), cred: "none" }, null, NOW);
      expect(page.entries.map((e) => e.who)).toEqual(["Anonymous"]);
    });
  });
});
