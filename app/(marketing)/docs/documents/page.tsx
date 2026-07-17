import type { Metadata } from "next";
import { CodeSample, Endpoint } from "../_components";

export const metadata: Metadata = { title: "Documents · StashJSON docs" };

export default function DocsDocumentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
      <p className="mt-3 max-w-prose text-muted">
        A document stores a JSON payload under the {" "}
        <code className="font-mono">json_data</code> field. Documents can be public
        (readable by anyone) or private (readable only with the owner&apos;s
        credentials), and can live inside a workspace. Every update snapshots
        the previous state and increments the document&apos;s {" "}
        <code className="font-mono">version</code>.
      </p>

      <CodeSample
        label="Document shape"
        code={`{
  "id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada", "role": "admin" },
  "is_public": false,
  "version": 3,
  "created_at": "2026-01-04T12:00:00.000Z",
  "updated_at": "2026-01-06T09:30:00.000Z"
}`}
      />

      <Endpoint
        method="POST"
        path="/documents"
        description="Create a document with a JSON payload, optionally inside a workspace via workspace_id. If that workspace has a template, json_data is validated against its JSON Schema first. Returns the created document with a 16-character id."
        parameters={[
          {
            name: "json_data",
            type: "object",
            required: true,
            in: "body",
            description:
              "The JSON payload to store, which can be any JSON object with unrestricted nesting.",
          },
          {
            name: "is_public",
            type: "boolean",
            required: false,
            in: "body",
            description:
              "Whether anyone can read the document without credentials.",
          },
          {
            name: "workspace_id",
            type: "string",
            required: false,
            in: "body",
            description:
              "The workspace to file the document under. This must be a workspace you own, otherwise the request returns 404. If that workspace has a template, json_data is validated against it first.",
          },
        ]}
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
      />

      <Endpoint
        method="GET"
        path="/documents/:id"
        description="Fetch a document. Remember, public documents are readable by anyone and private ones require the owner's credentials."
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description: "The document's 16-character id.",
          },
        ]}
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
        description="Fully replace a document's json_data. The previous content is snapshotted as a new version and the version number is incremented. This request requires authentication and is template-validated if the document is in a templated workspace."
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description: "The document's 16-character id.",
          },
          {
            name: "json_data",
            type: "object",
            required: false,
            in: "body",
            description:
              "The JSON to store in place of the current JSON payload.",
          },
          {
            name: "is_public",
            type: "boolean",
            required: false,
            in: "body",
            description:
              "Whether anyone can read the document without credentials.",
          },
        ]}
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
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description: "The document's 16-character id.",
          },
          {
            name: "json_data",
            type: "object",
            required: false,
            in: "body",
            description:
              "Top-level fields to merge into the stored payload. Matching keys are overwritten, the rest are left alone.",
          },
          {
            name: "is_public",
            type: "boolean",
            required: false,
            in: "body",
            description:
              "Whether anyone can read the document without credentials.",
          },
        ]}
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
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description: "The document's 16-character id.",
          },
        ]}
      />
    </div>
  );
}
