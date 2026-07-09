import { describe, it, expect } from "vitest";
import {
  apiKeyCreateSchema,
  documentCreateSchema,
  documentUpdateSchema,
  workspaceCreateSchema,
  workspaceTemplateSchema,
} from "@/lib/schemas";

describe("apiKeyCreateSchema", () => {
  it("accepts an empty/absent body (null or undefined)", () => {
    expect(apiKeyCreateSchema.safeParse(null).success).toBe(true);
    expect(apiKeyCreateSchema.safeParse(undefined).success).toBe(true);
    expect(apiKeyCreateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts an email string or null", () => {
    expect(apiKeyCreateSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(apiKeyCreateSchema.safeParse({ email: null }).success).toBe(true);
  });

  it("rejects a non-string email", () => {
    expect(apiKeyCreateSchema.safeParse({ email: 123 }).success).toBe(false);
  });
});

describe("documentCreateSchema", () => {
  it("accepts a minimal body and defaults is_public to false", () => {
    const result = documentCreateSchema.safeParse({ json_data: { a: 1 } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_public).toBe(false);
      expect(result.data.workspace_id).toBeUndefined();
    }
  });

  it("preserves an explicit is_public and workspace_id", () => {
    const result = documentCreateSchema.safeParse({
      json_data: {},
      is_public: true,
      workspace_id: "ws-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_public).toBe(true);
      expect(result.data.workspace_id).toBe("ws-1");
    }
  });

  it("rejects a body missing json_data", () => {
    expect(documentCreateSchema.safeParse({ is_public: true }).success).toBe(
      false,
    );
  });

  it("rejects json_data that is not an object", () => {
    expect(documentCreateSchema.safeParse({ json_data: "nope" }).success).toBe(
      false,
    );
    expect(documentCreateSchema.safeParse({ json_data: 5 }).success).toBe(false);
  });
});

describe("documentUpdateSchema", () => {
  it("accepts an empty body (all fields optional/nullish)", () => {
    expect(documentUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts json_data and/or is_public", () => {
    expect(
      documentUpdateSchema.safeParse({ json_data: { x: 1 } }).success,
    ).toBe(true);
    expect(documentUpdateSchema.safeParse({ is_public: false }).success).toBe(
      true,
    );
  });

  it("rejects a non-object json_data", () => {
    expect(documentUpdateSchema.safeParse({ json_data: [] }).success).toBe(
      false,
    );
  });
});

describe("workspaceCreateSchema", () => {
  it("accepts a name within 1..255 chars", () => {
    expect(workspaceCreateSchema.safeParse({ name: "My WS" }).success).toBe(
      true,
    );
    expect(
      workspaceCreateSchema.safeParse({ name: "x".repeat(255) }).success,
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(workspaceCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name longer than 255 chars", () => {
    expect(
      workspaceCreateSchema.safeParse({ name: "x".repeat(256) }).success,
    ).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(workspaceCreateSchema.safeParse({}).success).toBe(false);
  });
});

describe("workspaceTemplateSchema", () => {
  it("accepts an object json_schema", () => {
    expect(
      workspaceTemplateSchema.safeParse({ json_schema: { type: "object" } })
        .success,
    ).toBe(true);
  });

  it("rejects a missing or non-object json_schema", () => {
    expect(workspaceTemplateSchema.safeParse({}).success).toBe(false);
    expect(
      workspaceTemplateSchema.safeParse({ json_schema: "nope" }).success,
    ).toBe(false);
  });
});
