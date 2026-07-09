import { describe, it, expect } from "vitest";
import type {
  Document,
  DocumentVersion,
  Workspace,
  WorkspaceTemplate,
} from "@prisma/client";
import {
  documentResponse,
  documentVersionResponse,
  templateResponse,
  workspaceResponse,
} from "@/lib/serializers";

// Fabricated in-memory rows (no DB). Shapes mirror the Prisma models; camelCase
// in, snake_case out.

describe("documentResponse", () => {
  it("maps a Document row to the snake_case wire shape, field-for-field", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const updated = new Date("2026-02-02T00:00:00.000Z");
    const doc = {
      id: "doc_abc",
      userId: "user_1",
      workspaceId: "ws_1",
      jsonData: { hello: "world", nested: { a: 1 } },
      isPublic: true,
      version: 3,
      createdAt: created,
      updatedAt: updated,
    } as unknown as Document;

    const out = documentResponse(doc);

    expect(out).toEqual({
      id: "doc_abc",
      json_data: { hello: "world", nested: { a: 1 } },
      is_public: true,
      version: 3,
      created_at: created,
      updated_at: updated,
    });
    // Internal camelCase / owner fields must not leak.
    expect(out).not.toHaveProperty("userId");
    expect(out).not.toHaveProperty("workspaceId");
    expect(out).not.toHaveProperty("isPublic");
  });
});

describe("documentVersionResponse", () => {
  it("maps a DocumentVersion row to snake_case", () => {
    const created = new Date("2026-03-03T00:00:00.000Z");
    const version = {
      id: "ver_1",
      documentId: "doc_abc",
      jsonData: { snapshot: true },
      version: 2,
      createdAt: created,
    } as unknown as DocumentVersion;

    expect(documentVersionResponse(version)).toEqual({
      id: "ver_1",
      document_id: "doc_abc",
      json_data: { snapshot: true },
      version: 2,
      created_at: created,
    });
  });
});

describe("workspaceResponse", () => {
  const base = {
    id: "ws_1",
    userId: "user_1",
    name: "My Workspace",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  } as unknown as Workspace;

  it("includes document_count and has_template when provided", () => {
    const out = workspaceResponse(base, {
      documentCount: 5,
      hasTemplate: true,
    });
    expect(out).toEqual({
      id: "ws_1",
      name: "My Workspace",
      created_at: base.createdAt,
      updated_at: base.updatedAt,
      document_count: 5,
      has_template: true,
    });
  });

  it("leaves the optional fields undefined when opts are omitted", () => {
    const out = workspaceResponse(base);
    expect(out.document_count).toBeUndefined();
    expect(out.has_template).toBeUndefined();
    expect(out.id).toBe("ws_1");
    expect(out.name).toBe("My Workspace");
  });
});

describe("templateResponse", () => {
  it("maps a WorkspaceTemplate row to snake_case", () => {
    const created = new Date("2026-04-04T00:00:00.000Z");
    const updated = new Date("2026-05-05T00:00:00.000Z");
    const template = {
      id: "tpl_1",
      workspaceId: "ws_1",
      jsonSchema: { type: "object", required: ["name"] },
      createdAt: created,
      updatedAt: updated,
    } as unknown as WorkspaceTemplate;

    expect(templateResponse(template)).toEqual({
      id: "tpl_1",
      workspace_id: "ws_1",
      json_schema: { type: "object", required: ["name"] },
      created_at: created,
      updated_at: updated,
    });
  });
});
