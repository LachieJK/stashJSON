import { describe, expect, it } from "vitest";

/**
 * Handles (#64): the per-owner pseudonym an owner sees another account as.
 * The properties #60 decided on — stable per (owner, actor), unlinkable
 * across owners, never resolvable back — are what is tested, not the digest.
 */

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";

const SECRET = "unit-test-secret-of-sufficient-length";

describe("handleFor", () => {
  it("is `acct-` plus four hex characters", async () => {
    const { handleFor } = await import("@/lib/handles");
    expect(handleFor("owner-1", "actor-1", SECRET)).toMatch(/^acct-[0-9a-f]{4}$/);
    expect(handleFor("owner-1", "actor-1", SECRET)).toHaveLength(9);
  });

  it("is stable for the same owner and actor", async () => {
    const { handleFor } = await import("@/lib/handles");
    expect(handleFor("owner-1", "actor-1", SECRET)).toBe(handleFor("owner-1", "actor-1", SECRET));
  });

  it("gives the same actor a different handle on another owner's page", async () => {
    const { handleFor } = await import("@/lib/handles");
    expect(handleFor("owner-1", "actor-1", SECRET)).not.toBe(
      handleFor("owner-2", "actor-1", SECRET),
    );
  });

  it("changes with the secret and with the actor", async () => {
    const { handleFor } = await import("@/lib/handles");
    expect(handleFor("owner-1", "actor-1", SECRET)).not.toBe(
      handleFor("owner-1", "actor-1", `${SECRET}-other`),
    );
    expect(handleFor("owner-1", "actor-1", SECRET)).not.toBe(
      handleFor("owner-1", "actor-2", SECRET),
    );
  });

  it("never equals or contains the actor id", async () => {
    const { handleFor } = await import("@/lib/handles");
    // Real ids are 32-char Better Auth ids or uuids: longer than the handle,
    // so containment is impossible by length — and the check holds for any
    // secret, not just this one.
    for (const actor of ["Kqj13R7m3UnaF6nSa1ymqr9Cmz0GP6eF", "7e6b963f-5061-4178-a2d1-c9c59ed88292"]) {
      const handle = handleFor("owner-1", actor, SECRET);
      expect(handle).not.toBe(actor);
      expect(handle.includes(actor)).toBe(false);
    }
  });

  it("uses BETTER_AUTH_SECRET by default", async () => {
    const { handleFor } = await import("@/lib/handles");
    const { env } = await import("@/lib/env");
    expect(handleFor("owner-1", "actor-1")).toBe(
      handleFor("owner-1", "actor-1", env.BETTER_AUTH_SECRET),
    );
  });
});
