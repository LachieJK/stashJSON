import type { Metadata } from "next";
import { CodeSample, Endpoint } from "../_components";

export const metadata: Metadata = { title: "Version history · StashJSON docs" };

export default function DocsVersionsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Version history</h1>
      <p className="mt-3 max-w-prose text-muted">
        Every <code className="font-mono">PUT</code> or{" "}
        <code className="font-mono">PATCH</code> to a document records the
        previous state as a version snapshot before writing — nothing is ever
        lost. Reads follow the same rules as the document itself: public
        documents need no credentials, private ones require the owner&apos;s.
      </p>

      <CodeSample
        label="Version shape"
        code={`{
  "id": "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
  "document_id": "V1StGXR8Z5jdHi6B",
  "json_data": { "name": "Ada", "role": "admin" },
  "version": 1,
  "created_at": "2026-01-05T08:15:00.000Z"
}`}
      />

      <Endpoint
        method="GET"
        path="/documents/:id/versions"
        description="List all historical versions of a document, newest first."
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description: "The document's 16-character id.",
          },
        ]}
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
        path="/documents/:id/versions/:version"
        description="Fetch one specific historical version's JSON by its integer version number."
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description: "The document's 16-character id.",
          },
          {
            name: "version",
            type: "integer",
            required: true,
            in: "path",
            description:
              "The version number to fetch, counting from 1. Anything that is not an integer returns 400; a version that was never written returns 404.",
          },
        ]}
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
