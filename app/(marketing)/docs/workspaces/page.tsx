import type { Metadata } from "next";
import { CodeSample, Endpoint } from "../_components";

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

      <CodeSample
        label="Workspace shape"
        code={`{
  "id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  "name": "Production configs",
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z",
  "document_count": 12,
  "has_template": true
}`}
      />

      <Endpoint
        method="POST"
        path="/workspaces"
        description="Create a workspace — a named container for documents. name must be 1–255 characters. Returns the created workspace (201)."
        parameters={[
          {
            name: "name",
            type: "string",
            required: true,
            in: "body",
            description:
              "A display name for the workspace. 1–255 characters; names need not be unique.",
          },
        ]}
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
        parameters={[]}
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
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description:
              "The workspace's id. A workspace you do not own returns 404.",
          },
        ]}
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
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description:
              "The workspace's id. A workspace you do not own returns 404.",
          },
          {
            name: "after",
            type: "string",
            required: false,
            in: "query",
            description:
              "The id of the last document on the previous page. Returns the 25 documents created before it; omit it for the first page. An id that is not in this workspace returns 404.",
          },
        ]}
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
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description:
              "The workspace's id. A workspace you do not own returns 404.",
          },
          {
            name: "name",
            type: "string",
            required: true,
            in: "body",
            description:
              "The workspace's new display name. 1–255 characters. This is the only field a workspace exposes for editing.",
          },
        ]}
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
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description:
              "The workspace's id. A workspace you do not own returns 404. Its template is deleted with it; its documents are not.",
          },
        ]}
      />
    </div>
  );
}
