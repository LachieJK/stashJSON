import { describe, it, expect } from "vitest";
import { normalizeDatabaseUrl } from "@/lib/databaseUrl";

describe("normalizeDatabaseUrl", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "rewrites sslmode=%s to verify-full",
    (mode) => {
      const url = `postgresql://user:pass@host.neon.tech/db?sslmode=${mode}`;
      expect(normalizeDatabaseUrl(url)).toBe(
        "postgresql://user:pass@host.neon.tech/db?sslmode=verify-full",
      );
    },
  );

  it("leaves sslmode=verify-full untouched", () => {
    const url = "postgresql://user:pass@host/db?sslmode=verify-full";
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it("leaves sslmode=disable untouched", () => {
    const url = "postgresql://user:pass@host/db?sslmode=disable";
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it("leaves a URL without sslmode untouched", () => {
    const url = "postgresql://postgres:postgres@localhost:5432/stashjson?schema=public";
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it("preserves other query params when rewriting", () => {
    const url =
      "postgresql://user:pass@host.neon.tech/db?sslmode=require&channel_binding=require";
    const result = normalizeDatabaseUrl(url);
    const params = new URL(result).searchParams;
    expect(params.get("sslmode")).toBe("verify-full");
    expect(params.get("channel_binding")).toBe("require");
  });

  it("returns non-URL strings unchanged", () => {
    expect(normalizeDatabaseUrl("not a url")).toBe("not a url");
    expect(normalizeDatabaseUrl("")).toBe("");
  });
});
