// Deliberately dependency-free: prisma.config.ts imports this, and pulling in
// lib/env.ts's full validation there would break `postinstall`'s `prisma generate`
// in environments without a .env.

/**
 * Pin weak/aliased sslmode values to `verify-full`.
 *
 * node-pg currently treats `prefer`, `require`, and `verify-ca` as aliases for
 * `verify-full`, and warns that pg v9 will downgrade them to (weaker) libpq
 * semantics. Rewriting them keeps today's behavior explicit, silences the
 * warning, and means a Neon connection string (which ships with
 * `sslmode=require`) can be pasted as-is.
 */
export function normalizeDatabaseUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL — let downstream validation (lib/env.ts, Prisma CLI) reject it.
    return url;
  }

  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode === "prefer" || sslmode === "require" || sslmode === "verify-ca") {
    parsed.searchParams.set("sslmode", "verify-full");
    return parsed.toString();
  }
  return url;
}
