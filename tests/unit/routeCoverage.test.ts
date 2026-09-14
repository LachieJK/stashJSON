import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Metered by default" as a property rather than a claim.
 *
 * Metering rides on identity resolution (`requireUser`, `requireSessionUser`,
 * `assertCanRead` — and the loaders built on them), so a route is metered by
 * the fact that it authenticates. This test walks every route file under
 * `app/api/**` and insists each one either authenticates through one of those
 * entrypoints and wraps every handler in `withRateLimit` (or the headers never
 * reach the wire), or is named in `EXEMPT` with a written reason. A route added
 * in six months without a thought for rate limiting fails here.
 *
 * Source is inspected as text, not executed: the question is structural (which
 * functions does this file reach for?), and importing the handlers would drag
 * in Prisma and Better Auth for no gain.
 */

const ROOT = path.resolve(__dirname, "../..");
const API_DIR = path.join(ROOT, "app/api");

/**
 * Routes that are deliberately not metered by the per-account limiter. Every
 * entry needs a reason; an entry for a route that no longer exists fails, so
 * the list cannot accumulate dead exemptions.
 */
const EXEMPT: Record<string, string> = {
  "app/api/health/route.ts":
    "Monitoring probe. Structurally exempt — it resolves no identity, so " +
    "there is no bucket to charge — and safe to exempt only because it is " +
    "DB-free, which the dedicated test below enforces.",
  "app/api/auth/[...all]/route.ts":
    "Better Auth owns its own per-IP limiter on /api/auth/** (#39): " +
    "per-account keying cannot protect unauthenticated sign-in, and layering " +
    "ours on top would put two conflicting 429 shapes on the same paths. Its " +
    "configuration is tracked in #45.",
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

      it("wraps every handler in withRateLimit so the headers reach the wire", () => {
        for (const method of methods) {
          // `withAccessLog("<route>", …)` may sit outside it — it must, to log
          // a rebuilt 429's final status — but is not yet required here.
          expect(
            new RegExp(
              `export\\s+const\\s+${method}\\s*=\\s*` +
                `(?:withAccessLog\\(\\s*"[^"]+",\\s*)?withRateLimit\\(`,
            ).test(src),
            `${file}: ${method} is not wrapped in withRateLimit`,
          ).toBe(true);
        }
      });
    });
  }
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
