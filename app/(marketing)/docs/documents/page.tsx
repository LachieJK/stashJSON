import type { Metadata } from "next";
import { Endpoint } from "../_components";

export const metadata: Metadata = { title: "Documents · StashJSON docs" };

export default function DocsDocumentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
      <p className="mt-3 max-w-prose text-muted">
        A document stores an arbitrary JSON payload under{" "}
        <code className="font-mono">json_data</code>. Documents can be public
        (readable by anyone) or private (readable only with the owner&apos;s
        credentials), and can live inside a workspace. Every update snapshots
        the previous state and increments{" "}
        <code className="font-mono">version</code>.
      </p>

      <pre className="codeblock mt-4">
        <code>{`// Document shape
{
  "id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada", "role": "admin" },
  "is_public": false,
  "version": 3,
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-06T09:30:00.000Z"
}`}</code>
      </pre>

      <Endpoint
        method="POST"
        path="/documents"
        description="Create a document from arbitrary JSON, optionally inside a workspace via workspace_id. If that workspace has a template, json_data is validated against its JSON Schema first. Returns the created document with a 16-character id (201)."
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
        path="/documents/:id"
        description="Fetch a document. Public documents are readable by anyone; private ones require the owner's credentials."
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
        path="/documents/:id"
        description="Fully replace a document's json_data. The previous content is snapshotted as a new version and the version number is incremented. Template-validated if the document is in a templated workspace. Requires authentication."
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
        path="/documents/:id"
        description="Shallow-merge new fields into the existing JSON ({ ...existing, ...update }). Also versioned, and the merged result is template-validated. is_public can be updated alongside. Requires authentication."
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
        path="/documents/:id"
        description="Delete a document and its entire version history. Returns 204 No Content. Requires authentication."
      />
    </div>
  );
}
