import type { Metadata } from "next";
import { CodeSample, Endpoint } from "../_components";

export const metadata: Metadata = {
  title: "Workspace templates · StashJSON docs",
};

export default function DocsTemplatesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Workspace templates</h1>
      <p className="mt-3 max-w-prose text-muted">
        A workspace can hold one template — a JSON Schema (Draft-07). While a
        template is set, every document created or replaced in the workspace
        must conform to it. All template endpoints require authentication.
      </p>

      <CodeSample
        label="Template shape"
        code={`{
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
        path="/workspaces/:id/template"
        description="Set or replace the workspace's JSON Schema. json_schema must be a valid Draft-07 schema — it is validated before storage. All document creates and updates in the workspace must then conform. Upserts."
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
            name: "json_schema",
            type: "object",
            required: true,
            in: "body",
            description:
              "The JSON Schema (Draft-07) every document written to the workspace must satisfy. A schema that is not itself valid returns 400 and nothing is stored. Existing documents are not re-validated.",
          },
        ]}
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
        method="GET"
        path="/workspaces/:id/template"
        description="Fetch the workspace's current template. Returns 404 if the workspace has no template."
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
        method="DELETE"
        path="/workspaces/:id/template"
        description="Remove the template — documents in the workspace become free-form again. Returns 204 No Content. Existing documents are unaffected."
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description:
              "The workspace's id. A workspace you do not own — or one with no template — returns 404.",
          },
        ]}
      />
    </div>
  );
}
