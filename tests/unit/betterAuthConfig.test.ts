import { beforeAll, describe, expect, it, vi } from "vitest";

// lib/env validates DATABASE_URL at import. Nothing here runs a query, so a
// placeholder satisfies it without a database; the modules are imported lazily
// so the placeholder is in place first.
process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail }));

let parseList: typeof import("@/lib/env").parseList;
let authIpAddress: typeof import("@/lib/betterAuth").authIpAddress;
let authRateLimit: typeof import("@/lib/betterAuth").authRateLimit;
let authEmailAndPassword: typeof import("@/lib/betterAuth").authEmailAndPassword;
let authBackgroundTasks: typeof import("@/lib/betterAuth").authBackgroundTasks;

beforeAll(async () => {
  ({ parseList } = await import("@/lib/env"));
  ({ authIpAddress, authRateLimit, authEmailAndPassword, authBackgroundTasks } =
    await import("@/lib/betterAuth"));
});

// The Better Auth limiter config is pinned here because every one of these
// values silently falls back to an undocumented default if it is dropped:
// `window` to 10 seconds, sign-in to 3-per-10s, storage to a per-process Map,
// and the client IP to a single shared bucket. None of that fails a build.

describe("Better Auth rate-limit configuration", () => {
  it("resolves the client IP from x-forwarded-for only", () => {
    // `x-real-ip` is deliberately absent: a pass-through proxy would let a
    // caller choose their own bucket.
    expect(authIpAddress.ipAddressHeaders).toEqual(["x-forwarded-for"]);
    expect(Array.isArray(authIpAddress.trustedProxies)).toBe(true);
  });

  it("stores counters in the database, not per-process memory", () => {
    expect(authRateLimit.storage).toBe("database");
    expect(authRateLimit.modelName).toBe("authRateLimit");
  });

  it("states the window and ceiling explicitly", () => {
    expect(authRateLimit.window).toBe(60);
    expect(authRateLimit.max).toBe(100);
  });

  it("overrides the built-in 3-per-10s sign-in rule with a per-minute one", () => {
    expect(authRateLimit.customRules["/sign-in/email"]).toEqual({
      window: 60,
      max: 5,
    });
    expect(authRateLimit.customRules["/sign-up/email"]).toEqual({
      window: 60,
      max: 5,
    });
    expect(authRateLimit.customRules["/request-password-reset"]).toEqual({
      window: 300,
      max: 3,
    });
  });

  it("exempts the chatty /get-session endpoint", () => {
    expect(authRateLimit.customRules["/get-session"]).toBe(false);
  });

  it("is disabled under Vitest only", () => {
    expect(authRateLimit.enabled).toBe(false);
  });
});

describe("Better Auth password reset configuration", () => {
  it("ends every web session when a reset link is used", () => {
    expect(authEmailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
  });

  it("expires a reset link after one hour", () => {
    expect(authEmailAndPassword.resetPasswordTokenExpiresIn).toBe(3600);
  });

  it("emails the reset link, its one-hour expiry, and an ignore-me line", async () => {
    const url =
      "http://localhost:3000/api/auth/reset-password/tok123?callbackURL=%2Freset-password";
    await authEmailAndPassword.sendResetPassword({
      user: { email: "ada@example.com" },
      url,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = sendEmail.mock.calls[0][0];
    expect(email.to).toBe("ada@example.com");
    expect(email.subject).toBe("Reset your StashJSON password");
    expect(email.text).toContain(url);
    expect(email.text).toMatch(/one hour/);
    expect(email.text).toMatch(/ignore/i);
  });

  it("lets a background task run on outside a Next request scope", async () => {
    let ran = false;
    const task = Promise.resolve().then(() => {
      ran = true;
    });

    expect(() => authBackgroundTasks.handler(task)).not.toThrow();
    await task;
    expect(ran).toBe(true);
  });
});

describe("parseList (TRUSTED_PROXIES)", () => {
  it("splits on commas and trims", () => {
    expect(parseList("10.0.0.0/8, 172.16.0.0/12 ,fd00::/8")).toEqual([
      "10.0.0.0/8",
      "172.16.0.0/12",
      "fd00::/8",
    ]);
  });

  it("treats unset, empty, and trailing commas as no entries", () => {
    expect(parseList(undefined)).toEqual([]);
    expect(parseList("")).toEqual([]);
    expect(parseList(" , ")).toEqual([]);
    expect(parseList("10.0.0.1,")).toEqual(["10.0.0.1"]);
  });
});
