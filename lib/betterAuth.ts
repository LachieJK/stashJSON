import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * How Better Auth resolves the client IP its rate limiter keys on (`ip|path`).
 *
 * Only `x-forwarded-for` is consulted. `x-real-ip` is deliberately left out: a
 * proxy that forwards client headers without overwriting it would let a caller
 * pick their own bucket. With `TRUSTED_PROXIES` set, the forwarded chain is
 * walked right-to-left past the trusted hops to the first untrusted address;
 * unset, only a single-hop header is trusted and a multi-hop chain resolves to
 * no IP — at which point Better Auth logs "Rate limiting could not determine a
 * client IP" once and keys every caller on one shared bucket. That warning
 * appearing in production logs means this env var is missing or wrong.
 */
export const authIpAddress = {
  ipAddressHeaders: ["x-forwarded-for"],
  trustedProxies: env.TRUSTED_PROXIES,
};

/**
 * Better Auth's own limiter for `/api/auth/**` (per-IP, per-path; this is not
 * the per-account API limiter in lib/rateLimit.ts, which exempts this prefix).
 * Stated in full rather than inherited, because the library's defaults are
 * `window: 10, max: 100` — not the 60-second window its docs describe — plus an
 * undocumented 3-per-10s rule on `/sign-in*` and `/sign-up*`, overridden below.
 *
 * Storage is the database so the counters are shared across instances and
 * survive a process recycling; in-memory would give N × max on a multi-instance
 * host and let a caller reset their bucket by landing on a fresh instance. The
 * `authRateLimit` model is `AuthRateLimit` in prisma/schema.prisma, kept apart
 * from our own `RateLimitBucket`. `/get-session` is exempt: it is the chatty
 * endpoint and the only one that would pay the extra round trips for nothing.
 *
 * Off under Vitest only, so the suite is not time-dependent; on in dev so the
 * config is exercised before it reaches production. The numbers are knobs.
 */
export const authRateLimit = {
  enabled: env.NODE_ENV !== "test",
  storage: "database" as const,
  modelName: "authRateLimit",
  window: 60,
  max: 100,
  customRules: {
    "/sign-in/email": { window: 60, max: 5 },
    "/sign-up/email": { window: 60, max: 5 },
    "/request-password-reset": { window: 300, max: 3 },
    "/get-session": false as const,
  },
};

// Better Auth owns web login: email/password credentials, sessions, and the
// session cookie. It persists into the Prisma models User/Session/Account/
// Verification (see prisma/schema.prisma). Our public REST API keys are a
// separate concern handled in lib/auth.ts + the ApiKey table.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  advanced: { ipAddress: authIpAddress },
  rateLimit: authRateLimit,
  // Lets Better Auth set cookies from Next.js server actions / route handlers.
  plugins: [nextCookies()],
});

/**
 * Resolve the session from an explicit Headers object (e.g. `req.headers` in a
 * route handler). Preferred in request handlers because it doesn't depend on
 * the ambient next/headers store, so it also works when handlers are called
 * directly (tests). Returns the Better Auth session + user, or null.
 */
export async function getSessionFromHeaders(reqHeaders: Headers) {
  return auth.api.getSession({ headers: reqHeaders });
}

/**
 * Resolve the logged-in user from the ambient request cookies, for use in
 * Server Components where there is no Request in scope. Returns the Better Auth
 * session + user, or null when there is no valid session.
 */
export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}
