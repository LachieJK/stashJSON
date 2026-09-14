import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Metered by default" and "logged by default" as properties rather than claims.
 *
 * Metering rides on identity resolution (`requireUser`, `requireSessionUser`,
 * `assertCanRead` — and the loaders built on them), so a route is metered by
 * the fact that it authenticates. The access log (ADR-0002) learns its facts
 * from the same resolvers but needs its own wrapper to write the entry. This
 * test walks every route file under `app/api/**` and insists each one either
 * authenticates through one of those entrypoints and exports every handler as
 * `withAccessLog("<pattern>", withRateLimit(…))` — the log outermost, so a
 * rebuilt 429 is recorded with its final status, and the pattern literal the
 * one the file's location implies — or is named in `EXEMPT` with a written
 * reason. A route added in six months without a thought for either fails here.
 *
 * Source is inspected as text, not executed: the question is structural (which
 * functions does this file reach for?), and importing the handlers would drag
 * in Prisma and Better Auth for no gain.
 */

const ROOT = path.resolve(__dirname, "../..");
const API_DIR = path.join(ROOT, "app/api");

/**
 * Routes that are deliberately neither metered by the per-account limiter nor
 * written to the access log. One list for both on purpose: each exemption
 * holds for the log for the limiter's own reason. Every entry needs a reason;
 * an entry for a route that no longer exists fails, so the list cannot
 * accumulate dead exemptions.
 */
const EXEMPT: Record<string, string> = {
  "app/api/health/route.ts":
    "Monitoring probe. Structurally exempt — it resolves no identity, so " +
    "there is no bucket to charge — and safe to exempt only because it is " +
    "DB-free, which the dedicated test below enforces. Logging it would make " +
    "it DB-bound and turn every probe into a row.",
  "app/api/auth/[...all]/route.ts":
    "Better Auth owns its own per-IP limiter on /api/auth/** (#39): " +
    "per-account keying cannot protect unauthenticated sign-in, and layering " +
    "ours on top would put two conflicting 429 shapes on the same paths. Its " +
    "configuration is tracked in #45. Outside the access log for the same " +
    "reason: it is a vendor router, and sign-in statistics must come from " +
    "Better Auth's own hooks (see CONTEXT.md, deferred work).",
};

/**
 * The functions through which a request is billed. `loadOwnedDocument` and
 * `loadOwnedWorkspace` call `requireUser`; `assertCanRead` bills the owner
 * (public) or the caller (private) via `meterApi`. Reaching for any of these
 * is what makes a route "authenticate" for this test's purposes.
 */
const METERING_ENTRYPOINTS = [
  "requireUser",
  "requireSessionUser",
  "assertCanRead",
  "loadOwnedDocument",
  "loadOwnedWorkspace",
];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const relative = (file: string) => path.relative(ROOT, file);
const source = (file: string) => readFileSync(file, "utf8");

/** Identifiers called somewhere in the file — `name(` — not merely imported. */
const calls = (src: string, name: string) =>
  new RegExp(`\\b${name}\\s*\\(`).test(src);

/** The HTTP methods a route file exports, in either `const` or `function` form. */
function exportedMethods(src: string): string[] {
  return HTTP_METHODS.filter((m) =>
    new RegExp(`export\\s+(?:const|async\\s+function|function)\\s+${m}\\b`).test(src),
  );
}

/**
 * The access-log route pattern a file's location implies:
 * `app/api/documents/[id]/route.ts` → `/api/documents/[id]`. The literal at
 * the export site must be exactly this, so the log's `route` column can be
 * trusted to name a file.
 */
function routePatternFor(file: string): string {
  return "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "");
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether `method` is exported as exactly
 * `withAccessLog("<pattern>", withRateLimit(…))`. Either wrapper alone, the
 * two in the other order, or a different pattern literal all fail: the log
 * must sit outside the limiter to see a rebuilt 429's status, and the pattern
 * must be the file's own.
 */
function wrappedHandler(src: string, method: string, pattern: string): boolean {
  return new RegExp(
    `export\\s+const\\s+${method}\\s*=\\s*` +
      `withAccessLog\\(\\s*"${escapeRegExp(pattern)}"\\s*,\\s*withRateLimit\\(`,
  ).test(src);
}

/** Every `@/`-relative module a file imports, transitively, as repo paths. */
function importClosure(file: string, seen = new Set<string>()): Set<string> {
  for (const match of source(file).matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
    const spec = match[1].slice(2);
    const resolved = [".ts", ".tsx", "/index.ts"]
      .map((ext) => path.join(ROOT, spec + ext))
      .find((candidate) => {
        try {
          return statSync(candidate).isFile();
        } catch {
          return false;
        }
      });
    if (!resolved) continue;
    const rel = relative(resolved);
    if (seen.has(rel)) continue;
    seen.add(rel);
    importClosure(resolved, seen);
  }
  return seen;
}

const files = routeFiles(API_DIR).map(relative).sort();

describe("every /api route is metered or exempt with a reason", () => {
  it("finds the route files (guards against a silently empty walk)", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("app/api/documents/route.ts");
  });

  it("names only real routes in EXEMPT", () => {
    for (const exempt of Object.keys(EXEMPT)) {
      expect(files, `EXEMPT entry ${exempt} does not exist`).toContain(exempt);
    }
  });

  it("gives every exemption a reason", () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(reason.trim().length, `${file} is exempt without a reason`).toBeGreaterThan(20);
    }
  });

  for (const file of files.filter((f) => !(f in EXEMPT))) {
    describe(file, () => {
      const src = source(path.join(ROOT, file));
      const methods = exportedMethods(src);

      it("exports at least one HTTP method handler", () => {
        expect(methods.length).toBeGreaterThan(0);
      });

      it("authenticates through a metering entrypoint", () => {
        const used = METERING_ENTRYPOINTS.filter((fn) => calls(src, fn));
        expect(
          used,
          `${file} calls none of ${METERING_ENTRYPOINTS.join(", ")} — it is ` +
            `unmetered. Authenticate through one of them, or add it to EXEMPT ` +
            `with a reason.`,
        ).not.toEqual([]);
      });

      it("exports every handler as withAccessLog(<its own pattern>, withRateLimit(…))", () => {
        const pattern = routePatternFor(file);
        for (const method of methods) {
          expect(
            wrappedHandler(src, method, pattern),
            `${file}: ${method} must be exported as ` +
              `withAccessLog("${pattern}", withRateLimit(…)) — the log outermost ` +
              `so a 429 is logged with its final status, and the pattern literal ` +
              `matching the file's location.`,
          ).toBe(true);
        }
      });
    });
  }
});

describe("the wrapper check itself", () => {
  // The property is only as strong as the matcher, so the matcher is tested
  // against the shapes it must reject as well as the one it accepts.
  const pattern = "/api/documents/[id]";
  const ok = `export const GET = withAccessLog(
  "/api/documents/[id]",
  withRateLimit((req: Request) => handle(async () => ok())),
);`;

  it("derives the pattern from the file location", () => {
    expect(routePatternFor("app/api/documents/route.ts")).toBe("/api/documents");
    expect(routePatternFor("app/api/documents/[id]/versions/[version]/route.ts")).toBe(
      "/api/documents/[id]/versions/[version]",
    );
  });

  it("accepts the log-outside-limiter shape with the file's own pattern", () => {
    expect(wrappedHandler(ok, "GET", pattern)).toBe(true);
  });

  it("rejects a handler wrapped in only one of the two", () => {
    expect(
      wrappedHandler(`export const GET = withRateLimit((req: Request) => ok());`, "GET", pattern),
    ).toBe(false);
    expect(
      wrappedHandler(
        `export const GET = withAccessLog("/api/documents/[id]", (req: Request) => ok());`,
        "GET",
        pattern,
      ),
    ).toBe(false);
  });

  it("rejects the limiter outside the log (a 429 would be logged as its inner status)", () => {
    expect(
      wrappedHandler(
        `export const GET = withRateLimit(withAccessLog("/api/documents/[id]", ok));`,
        "GET",
        pattern,
      ),
    ).toBe(false);
  });

  it("rejects a pattern literal that does not match the file's location", () => {
    expect(wrappedHandler(ok, "GET", "/api/documents")).toBe(false);
    expect(wrappedHandler(ok, "GET", "/api/documents/[id]/versions")).toBe(false);
  });

  it("checks the named method, not just any wrapped export in the file", () => {
    expect(wrappedHandler(ok, "DELETE", pattern)).toBe(false);
  });
});

describe("/api/health stays DB-free", () => {
  // The whole reason it is safe to exempt: an unmetered route that touched the
  // database would be free load on Postgres for anyone who found it.
  const health = "app/api/health/route.ts";

  it("is exempt", () => {
    expect(EXEMPT).toHaveProperty(health);
  });

  it("never reaches lib/db.ts, directly or transitively", () => {
    const closure = importClosure(path.join(ROOT, health));
    expect([...closure]).not.toContain("lib/db.ts");
  });

  it("does not open its own database connection either", () => {
    const src = source(path.join(ROOT, health));
    expect(src).not.toMatch(/prisma|PrismaClient|@prisma\/|pg["']|DATABASE_URL/);
  });
});
