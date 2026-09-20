import { beforeAll, describe, expect, it } from "vitest";

// lib/env validates DATABASE_URL at import. Nothing here runs a query, so a
// placeholder satisfies it without a database; the modules are imported lazily
// so the placeholder is in place first.
process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit";

let parseList: typeof import("@/lib/env").parseList;
let authIpAddress: typeof import("@/lib/betterAuth").authIpAddress;
let authRateLimit: typeof import("@/lib/betterAuth").authRateLimit;
let emailAndPassword: typeof import("@/lib/betterAuth").emailAndPassword;
let resetPasswordEmail: typeof import("@/lib/betterAuth").resetPasswordEmail;

beforeAll(async () => {
  ({ parseList } = await import("@/lib/env"));
  ({ authIpAddress, authRateLimit, emailAndPassword, resetPasswordEmail } =
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
  it("wires the reset-link sender", () => {
    // Without this Better Auth answers /request-password-reset with 400
    // RESET_PASSWORD_DISABLED, and the Forgot? link goes nowhere.
    expect(typeof emailAndPassword.sendResetPassword).toBe("function");
  });

  it("ends every web session when the password is reset", () => {
    expect(emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
  });

  it("keeps Better Auth's one-hour token expiry", () => {
    // The email copy and the forgot-password page both say "one hour"; an
    // override here would silently make them wrong.
    expect("resetPasswordTokenExpiresIn" in emailAndPassword).toBe(false);
  });

  it("writes a plain-text message carrying the link, the expiry and the ignore note", () => {
    const url = "http://localhost:3000/api/auth/reset-password/tok?callbackURL=%2Freset-password";
    const message = resetPasswordEmail("person@example.com", url);
    expect(message.to).toBe("person@example.com");
    expect(message.subject).toBe("Reset your StashJSON password");
    expect(message.text).toContain(url);
    expect(message.text).toMatch(/one hour/i);
    expect(message.text).toMatch(/ignore/i);
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
