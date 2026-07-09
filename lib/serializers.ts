import type {
  Document,
  DocumentVersion,
  Workspace,
  WorkspaceTemplate,
} from "@prisma/client";

// Map Prisma rows (camelCase) to the snake_case JSON the public API returns,
// preserving parity with the legacy FastAPI responses.

export function documentResponse(doc: Document) {
  return {
    id: doc.id,
    json_data: doc.jsonData,
    is_public: doc.isPublic,
    version: doc.version,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

export function documentVersionResponse(v: DocumentVersion) {
  return {
    id: v.id,
    document_id: v.documentId,
    json_data: v.jsonData,
    version: v.version,
    created_at: v.createdAt,
  };
}

export function workspaceResponse(
  ws: Workspace,
  opts: { documentCount?: number; hasTemplate?: boolean } = {},
) {
  return {
    id: ws.id,
    name: ws.name,
    created_at: ws.createdAt,
    updated_at: ws.updatedAt,
    document_count: opts.documentCount,
    has_template: opts.hasTemplate,
  };
}

export function templateResponse(t: WorkspaceTemplate) {
  return {
    id: t.id,
    workspace_id: t.workspaceId,
    json_schema: t.jsonSchema,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}
