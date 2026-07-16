import type { Metadata } from "next";
import { Endpoint } from "../_components";

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

      <pre className="codeblock mt-4">
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
        path="/documents/:id/versions"
        description="List all historical versions of a document, newest first."
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
