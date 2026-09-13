import { z } from "zod";
import { normalizeDatabaseUrl } from "@/lib/databaseUrl";

// Validate environment variables once, at startup.
const isProd = process.env.NODE_ENV === "production";

// Auth secrets are mandatory in production but get insecure fallbacks in
// dev/test so `npm run dev`, vitest, and CI don't require a .env just to boot.
const devDefault = <T extends string>(value: T | undefined, fallback: T): T =>
  isProd ? (value as T) : (value ?? fallback);

/**
 * Split a comma-separated list env var into its entries. Blank entries are
 * dropped so a trailing comma or an empty string means "none", not `[""]`.
 */
export const parseList = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const envSchema = z.object({
  DATABASE_URL: z.string().url().transform(normalizeDatabaseUrl),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Better Auth: signs session cookies and derives keys. Must be a real secret
  // in production; a fixed dev value keeps local sessions stable across reloads.
  BETTER_AUTH_SECRET: z.string().min(16),
  // Absolute base URL of the app, used by Better Auth for cookies/redirects.
  BETTER_AUTH_URL: z.string().url(),
  // Reverse proxies (IPs or CIDRs) whose hops Better Auth may strip from
  // `x-forwarded-for` when resolving the client IP its rate limiter keys on.
  // Deployment-specific, hence an env var: unset means "trust only a single-hop
  // header", and a multi-hop chain then resolves to no IP at all — which
  // collapses every caller onto one shared sign-in bucket (issue #45).
  TRUSTED_PROXIES: z.array(z.string().min(1)),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  BETTER_AUTH_SECRET: devDefault(
    process.env.BETTER_AUTH_SECRET,
    "dev-only-insecure-better-auth-secret-do-not-use-in-production",
  ),
  BETTER_AUTH_URL: devDefault(
    process.env.BETTER_AUTH_URL,
    "http://localhost:3000",
  ),
  TRUSTED_PROXIES: parseList(process.env.TRUSTED_PROXIES),
});
