import { Endpoint } from "../_components";

export default function DocsWorkspacesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
      <p className="mt-3 text-muted">
        A workspace groups related documents and can carry an optional JSON
        Schema template that every document in it is validated against on write.
        All workspace endpoints require authentication.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Workspace shape</h2>
      <pre className="codeblock mt-3">
        <code>{`{
  "id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "name": "Production configs",
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z",
  "document_count": 12,
  "has_template": true
}`}</code>
      </pre>

      <h2 className="mt-8 text-lg font-semibold">Endpoints</h2>

      <Endpoint
        method="GET"
        path="/api/workspaces"
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
        method="POST"
        path="/api/workspaces"
        description="Create a workspace. name must be 1–255 characters. Returns the created workspace (201)."
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
        path="/api/workspaces/{id}"
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
        method="PUT"
        path="/api/workspaces/{id}"
        description="Rename a workspace. name must be 1–255 characters."
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
        path="/api/workspaces/{id}"
        description="Delete a workspace. Returns 204 No Content. Documents are NOT deleted — each document's workspace_id is set to null."
      />

      <Endpoint
        method="GET"
        path="/api/workspaces/{id}/documents"
        description="List documents in a workspace. Cursor-paginated, newest first, up to 25 per page. Pass ?after=<documentId> to fetch the next page."
        responseBody={`// GET /api/workspaces/{id}/documents?after=V1StGXR8Z5jdHi6B
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

      <h2 className="mt-8 text-lg font-semibold">Templates</h2>
      <p className="mt-3 text-muted">
        A workspace can hold one template — a JSON Schema (Draft-07, validated
        with Ajv). While a template is set, every document created or replaced in
        the workspace is validated against it.
      </p>

      <pre className="codeblock mt-3">
        <code>{`// Template shape
{
  "id": "d4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f90",
  "workspace_id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "json_schema": {
    "type": "object",
    "required": ["name"],
    "properties": {
      "name": { "type": "string" },
      "role": { "type": "string" }
    }
  },
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z"
}`}</code>
      </pre>

      <Endpoint
        method="GET"
        path="/api/workspaces/{id}/template"
        description="Fetch the workspace's template. Returns 404 if the workspace has no template."
        responseBody={`{
  "id": "d4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f90",
  "workspace_id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "json_schema": {
    "type": "object",
    "required": ["name"],
    "properties": {
      "name": { "type": "string" },
      "role": { "type": "string" }
    }
  },
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z"
}`}
      />

      <Endpoint
        method="PUT"
        path="/api/workspaces/{id}/template"
        description="Create or replace the workspace's template. The body's json_schema must be a valid JSON Schema (Draft-07), checked with Ajv before it is stored. Upserts."
        requestBody={`{
  "json_schema": {
    "type": "object",
    "required": ["name"],
    "properties": {
      "name": { "type": "string" },
      "role": { "type": "string" }
    }
  }
}`}
        responseBody={`{
  "id": "d4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f90",
  "workspace_id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "json_schema": {
    "type": "object",
    "required": ["name"],
    "properties": {
      "name": { "type": "string" },
      "role": { "type": "string" }
    }
  },
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-07T10:00:00.000Z"
}`}
      />

      <Endpoint
        method="DELETE"
        path="/api/workspaces/{id}/template"
        description="Remove the workspace's template. Returns 204 No Content. Existing documents are unaffected; new writes are no longer validated."
      />
    </div>
  );
}
