import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

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
    // Email verification is a future addition; let users in immediately for now.
    requireEmailVerification: false,
  },
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
