import type { Metadata } from "next";
import { Endpoint } from "../_components";

export const metadata: Metadata = { title: "Workspaces · StashJSON docs" };

export default function DocsWorkspacesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
      <p className="mt-3 max-w-prose text-muted">
        A workspace is a named container for documents. It can also carry an
        optional JSON Schema template (see Workspace templates) that every
        document in it is validated against on write. All workspace endpoints
        require authentication.
      </p>

      <pre className="codeblock mt-4">
        <code>{`// Workspace shape
{
  "id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "name": "Production configs",
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z",
  "document_count": 12,
  "has_template": true
}`}</code>
      </pre>

      <Endpoint
        method="POST"
        path="/workspaces"
        description="Create a workspace — a named container for documents. name must be 1–255 characters. Returns the created workspace (201)."
        requestBody={`{
  "name": "Production configs"
}`}
        responseBody={`{
  "id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "name": "Production configs",
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z",
  "document_count": 0,
  "has_template": false
}`}
      />

      <Endpoint
        method="GET"
        path="/workspaces"
        description="List all workspaces owned by the caller."
        responseBody={`[
  {
    "id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
    "name": "Production configs",
    "created_at": "2026-01-04T12:00:00.000Z",
    "updated_at": "2026-01-04T12:00:00.000Z",
    "document_count": 12,
    "has_template": true
  }
]`}
      />

      <Endpoint
        method="GET"
        path="/workspaces/:id"
        description="Fetch a single workspace owned by the caller."
        responseBody={`{
  "id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "name": "Production configs",
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z",
  "document_count": 12,
  "has_template": true
}`}
      />

      <Endpoint
        method="GET"
        path="/workspaces/:id/documents"
        description="List all documents inside a workspace. Cursor-paginated, newest first, up to 25 per page — pass ?after=<documentId> to fetch the next page."
        responseBody={`// GET /workspaces/:id/documents?after=V1StGXR8Z5jdHi6B
[
  {
    "id": "9kQ2mNpR7xLtY3aW",
    "json_data": { "name": "Grace" },
    "is_public": false,
    "version": 1,
    "created_at": "2026-01-04T11:59:00.000Z",
    "updated_at": "2026-01-04T11:59:00.000Z"
  }
]`}
      />

      <Endpoint
        method="PUT"
        path="/workspaces/:id"
        description="Rename/update a workspace. name must be 1–255 characters."
        requestBody={`{
  "name": "Staging configs"
}`}
        responseBody={`{
  "id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "name": "Staging configs",
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-07T10:00:00.000Z",
  "document_count": 12,
  "has_template": true
}`}
      />

      <Endpoint
        method="DELETE"
        path="/workspaces/:id"
        description="Delete a workspace. Returns 204 No Content. Its documents are NOT deleted — they are detached, each document's workspace_id set to null."
      />
    </div>
  );
}
