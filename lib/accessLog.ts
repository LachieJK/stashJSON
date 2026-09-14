import { after } from "next/server";
import type { Credential } from "@/prisma/generated/client";
import { prisma } from "@/lib/db";

/**
 * The access log (ADR-0002): one entry per request to a route we control,
 * written once the response is on the wire, carrying no personal data beyond
 * user ids.
 *
 * Structurally this is the rate limiter's twin. Facts about a request are
 * recorded wherever they become known — the credential in the identity
 * resolvers, the owner and resource in the read guards — into a per-request
 * stash, and `withAccessLog` (composed outside `handle()`, like `withRateLimit`)
 * folds them into one row after the handler returns. The log decides nothing
 * about the request, so it never awaits the insert and never fails a request:
 * a write that throws is logged and swallowed.
 */

/**
 * The actual path is bounded before it is stored: an attacker-supplied URL must
 * not be able to dictate row size. Long enough for any real route plus an id.
 */
export const MAX_PATH_LENGTH = 512;

/**
 * What the request path learns about a request, each piece nullable because
 * it may never be learnt: a `404` finds no owner, an anonymous read finds no
 * actor. `credential` defaults to `none` when no resolver recorded one.
 */
export type AccessFacts = {
  credential: Credential;
  /** Who made the request — whoever the credential resolved to. */
  actorUserId: string | null;
  /** Whose resource was targeted. Null means no resource existed. */
  ownerUserId: string | null;
  /** Snapshot ids, no foreign keys: history outlives the resource. */
  apiKeyId: string | null;
  documentId: string | null;
  workspaceId: string | null;
};

/** What the wrapper learns for itself, from the request and the response. */
export type AccessEntry = AccessFacts & {
  method: string;
  route: string;
  path: string;
  status: number;
  durationMs: number;
};

const NO_FACTS: AccessFacts = {
  credential: "none",
  actorUserId: null,
  ownerUserId: null,
  apiKeyId: null,
  documentId: null,
  workspaceId: null,
};

// The per-request stash, keyed by the `Request` so it is collected with it —
// the same shape as the limiter's `recordDecision`. Partial because facts
// arrive piecemeal across the request path.
const facts = new WeakMap<Request, Partial<AccessFacts>>();

/**
 * Record what is now known about a request, merging over anything recorded
 * earlier. Later calls win on a repeated key; a key never recorded stays at
 * its null/`none` default.
 */
export function recordAccess(req: Request, partial: Partial<AccessFacts>): void {
  facts.set(req, { ...facts.get(req), ...partial });
}

/** The facts recorded so far for a request, defaults filled in. Read-only. */
export function recordedAccess(req: Request): AccessFacts {
  return { ...NO_FACTS, ...facts.get(req) };
}

/** The path component only — never the query string — bounded in length. */
function boundedPath(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  return pathname.slice(0, MAX_PATH_LENGTH);
}

/**
 * Run `task` once the response has been sent. `after()` is Next's hook for
 * exactly this, but it throws outside a request scope (route handlers invoked
 * directly, as the tests do); there, the task simply runs detached. Either
 * way the caller never waits on it.
 */
function afterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Insert one entry. Best-effort: a failure is logged and never rethrown. */
async function write(entry: AccessEntry): Promise<void> {
  try {
    await prisma.accessLog.create({ data: entry });
  } catch (err) {
    console.error("Access log write failed; entry dropped:", err);
  }
}

/**
 * Compose outside `handle()` — and outside `withRateLimit`, so a rebuilt `429`
 * is logged with its final status — to leave one entry per request.
 *
 * `route` is the file's route pattern as a literal (`"/api/documents/[id]"`),
 * not derived from `ctx.params`: substituting param values back out of the
 * path breaks the moment a value also occurs elsewhere in it, and a literal
 * can be checked against the file's location by a coverage test.
 *
 * The clock starts before the handler and stops after it, so `durationMs` is
 * the handler's own time including `handle()`'s error mapping. The insert is
 * scheduled with `after()` and adds nothing to the caller's latency.
 */
export function withAccessLog<Args extends unknown[]>(
  route: string,
  handler: (req: Request, ...args: Args) => Promise<Response>,
): (req: Request, ...args: Args) => Promise<Response> {
  return async (req, ...args) => {
    const started = performance.now();
    const res = await handler(req, ...args);
    const entry: AccessEntry = {
      ...recordedAccess(req),
      method: req.method,
      route,
      path: boundedPath(req.url),
      status: res.status,
      durationMs: Math.round(performance.now() - started),
    };
    afterResponse(() => write(entry));
    return res;
  };
}
