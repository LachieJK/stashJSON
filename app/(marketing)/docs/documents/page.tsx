import { Endpoint } from "../_components";

export default function DocsDocumentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
      <p className="mt-3 text-muted">
        A document stores an arbitrary JSON payload under{" "}
        <code className="font-mono">json_data</code>. Documents can be public
        (readable by anyone) or private (readable only with the owner&apos;s
        key). Every update snapshots the previous state and increments{" "}
        <code className="font-mono">version</code>.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Document shape</h2>
      <pre className="codeblock mt-3">
        <code>{`{
  "id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada", "role": "admin" },
  "is_public": false,
  "version": 3,
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-06T09:30:00.000Z"
}`}</code>
      </pre>

      <h2 className="mt-8 text-lg font-semibold">Endpoints</h2>

      <Endpoint
        method="POST"
        path="/api/documents"
        description="Create a document. If workspace_id refers to a workspace that has a template, json_data is validated against that JSON Schema first. Returns the created document (201)."
        requestBody={`{
  "json_data": { "name": "Ada", "role": "admin" },
  "is_public": false,
  "workspace_id": "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c"
}`}
        responseBody={`{
  "id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada", "role": "admin" },
  "is_public": false,
  "version": 1,
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z"
}`}
      >
        <code className="font-mono">is_public</code> and{" "}
        <code className="font-mono">workspace_id</code> are optional.
      </Endpoint>

      <Endpoint
        method="GET"
        path="/api/documents/{id}"
        description="Fetch a single document. Public documents need no API key; private documents require the owner's key."
        responseBody={`{
  "id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada", "role": "admin" },
  "is_public": false,
  "version": 1,
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-04T12:00:00.000Z"
}`}
      />

      <Endpoint
        method="PUT"
        path="/api/documents/{id}"
        description="Full replace of json_data. The prior version is snapshotted and version is incremented. Requires authentication."
        requestBody={`{
  "json_data": { "name": "Ada Lovelace", "role": "owner" }
}`}
        responseBody={`{
  "id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada Lovelace", "role": "owner" },
  "is_public": false,
  "version": 2,
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-05T08:15:00.000Z"
}`}
      />

      <Endpoint
        method="PATCH"
        path="/api/documents/{id}"
        description="Shallow-merge into json_data ({ ...existing, ...update }). The prior version is snapshotted and version is incremented. is_public can be updated alongside. Requires authentication."
        requestBody={`{
  "json_data": { "role": "admin" },
  "is_public": true
}`}
        responseBody={`{
  "id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada Lovelace", "role": "admin" },
  "is_public": true,
  "version": 3,
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-06T09:30:00.000Z"
}`}
      />

      <Endpoint
        method="DELETE"
        path="/api/documents/{id}"
        description="Delete a document and its version history. Returns 204 No Content. Requires authentication."
      />

      <h2 className="mt-8 text-lg font-semibold">Version history</h2>
      <p className="mt-3 text-muted">
        Each <code className="font-mono">PUT</code> or{" "}
        <code className="font-mono">PATCH</code> records the previous document
        state as a version snapshot.
      </p>

      <pre className="codeblock mt-3">
        <code>{`// Version shape
{
  "id": "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
  "document_id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada", "role": "admin" },
  "version": 1,
  "created_at": "2026-01-05T08:15:00.000Z"
}`}</code>
      </pre>

      <Endpoint
        method="GET"
        path="/api/documents/{id}/versions"
        description="List all version snapshots for a document. Public-read rules apply — public documents need no key, private ones require the owner's key."
        responseBody={`[
  {
    "id": "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
    "document_id": "V1StGXR8Z5jdHi6B",
    "json_data": { "name": "Ada", "role": "admin" },
    "version": 1,
    "created_at": "2026-01-05T08:15:00.000Z"
  }
]`}
      />

      <Endpoint
        method="GET"
        path="/api/documents/{id}/versions/{version}"
        description="Fetch a single version snapshot by its version number. Public-read rules apply."
        responseBody={`{
  "id": "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
  "document_id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada", "role": "admin" },
  "version": 1,
  "created_at": "2026-01-05T08:15:00.000Z"
}`}
      />
    </div>
  );
}
