import { afterEach, describe, expect, it, vi } from "vitest";

// lib/env validates once, at import, so each case stubs the environment and
// loads a fresh copy of the module.
const loadEnv = async () => {
  vi.resetModules();
  return (await import("@/lib/env")).env;
};

// A production environment complete except for the mail settings.
function stubProductionWithoutMail(phase?: string) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PHASE", phase);
  vi.stubEnv("DATABASE_URL", "postgresql://unit:unit@localhost:5432/unit");
  vi.stubEnv("BETTER_AUTH_SECRET", "a-real-production-secret");
  vi.stubEnv("BETTER_AUTH_URL", "https://stashjson.example");
  vi.stubEnv("RESEND_API_KEY", undefined);
  vi.stubEnv("EMAIL_FROM", undefined);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mail settings in production", () => {
  it("refuses to boot the production server without them", async () => {
    stubProductionWithoutMail();
    await expect(loadEnv()).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("lets `next build` run without them", async () => {
    stubProductionWithoutMail("phase-production-build");
    const env = await loadEnv();
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("still demands the auth secret during `next build`", async () => {
    stubProductionWithoutMail("phase-production-build");
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);
    await expect(loadEnv()).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });
});
