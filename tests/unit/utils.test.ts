import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  generateDocumentId,
  hashApiKey,
} from "@/lib/utils";

describe("hashApiKey", () => {
  it("is deterministic for the same input", () => {
    expect(hashApiKey("my-secret-key")).toBe(hashApiKey("my-secret-key"));
  });

  it("produces the correct SHA-256 hex digest", () => {
    // Known-answer test: sha256("test") is a well-known constant.
    expect(hashApiKey("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
  });

  it("matches an independent node:crypto computation for arbitrary input", () => {
    const key = generateApiKey();
    const expected = createHash("sha256").update(key).digest("hex");
    expect(hashApiKey(key)).toBe(expected);
  });

  it("returns a 64-char lowercase hex string", () => {
    expect(hashApiKey("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different inputs", () => {
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});

describe("generateApiKey", () => {
  it("is exactly 32 characters long", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateApiKey()).toHaveLength(32);
    }
  });

  it("uses only URL-safe base64 characters", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateApiKey()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    }
  });

  it("is effectively unique across many calls", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 1000; i++) keys.add(generateApiKey());
    expect(keys.size).toBe(1000);
  });
});

describe("generateDocumentId", () => {
  it("is exactly 16 characters long", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateDocumentId()).toHaveLength(16);
    }
  });

  it("uses only the alphanumeric nanoid alphabet", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateDocumentId()).toMatch(/^[A-Za-z0-9]{16}$/);
    }
  });

  it("is effectively unique across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateDocumentId());
    expect(ids.size).toBe(1000);
  });
});
