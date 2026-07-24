import { describe, it, expect } from "vitest";
import {
  apiKeyNameSchema,
  documentCreateSchema,
  documentUpdateSchema,
  workspaceCreateSchema,
  workspaceTemplateSchema,
  workspaceUpdateSchema,
} from "@/lib/schemas";

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

describe("documentCreateSchema — type strictness", () => {
  it("rejects a stringly-typed is_public (no coercion)", () => {
    expect(
      documentCreateSchema.safeParse({ json_data: {}, is_public: "true" })
        .success,
    ).toBe(false);
  });

  it("rejects a non-string workspace_id", () => {
    expect(
      documentCreateSchema.safeParse({ json_data: {}, workspace_id: 123 })
        .success,
    ).toBe(false);
  });

  it("rejects null json_data (required field)", () => {
    expect(documentCreateSchema.safeParse({ json_data: null }).success).toBe(
      false,
    );
  });
});

describe("documentUpdateSchema — type strictness", () => {
  it("rejects a stringly-typed is_public", () => {
    expect(documentUpdateSchema.safeParse({ is_public: "yes" }).success).toBe(
      false,
    );
  });

  it("accepts explicit nulls (meaning: no change)", () => {
    const result = documentUpdateSchema.safeParse({
      json_data: null,
      is_public: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("workspaceUpdateSchema", () => {
  it("enforces the same 1..255 name rules as create", () => {
    expect(workspaceUpdateSchema.safeParse({ name: "Renamed" }).success).toBe(
      true,
    );
    expect(workspaceUpdateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      workspaceUpdateSchema.safeParse({ name: "x".repeat(256) }).success,
    ).toBe(false);
    expect(workspaceUpdateSchema.safeParse({ name: 42 }).success).toBe(false);
  });
});

describe("apiKeyNameSchema", () => {
  it("accepts a name within 1..100 chars", () => {
    expect(apiKeyNameSchema.safeParse({ name: "CI key" }).success).toBe(true);
    expect(
      apiKeyNameSchema.safeParse({ name: "x".repeat(100) }).success,
    ).toBe(true);
  });

  it("rejects an empty, missing, over-long, or non-string name", () => {
    expect(apiKeyNameSchema.safeParse({ name: "" }).success).toBe(false);
    expect(apiKeyNameSchema.safeParse({}).success).toBe(false);
    expect(
      apiKeyNameSchema.safeParse({ name: "x".repeat(101) }).success,
    ).toBe(false);
    expect(apiKeyNameSchema.safeParse({ name: 7 }).success).toBe(false);
  });
});
