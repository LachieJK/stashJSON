import type { Metadata } from "next";
import { CodeSample, Endpoint } from "../_components";

export const metadata: Metadata = { title: "API keys · StashJSON docs" };

export default function DocsKeysPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">API keys</h1>
      <p className="mt-3 max-w-prose text-muted">
        These endpoints manage the API keys themselves and power the
        dashboard&apos;s account page. They accept{" "}
        <strong className="font-semibold text-text">
          session-cookie authentication only
        </strong>{" "}
        — you must be logged in to the web app; an{" "}
        <code className="font-mono">X-API-Key</code> header is not accepted
        here. Only the SHA-256 hash of a key is stored: the raw key is shown
        exactly once, at creation.
      </p>

      <CodeSample
        label="Key shape"
        code={`{
  "id": "e5f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9012",
  "name": "CI deploys",
  "last_used_at": "2026-01-06T09:30:00.000Z",
  "created_at": "2026-01-04T12:00:00.000Z",
  "revoked_at": null
}`}
      />

      <Endpoint
        method="GET"
        path="/keys"
        description="List the logged-in user's active API keys — metadata only, never the raw key."
        auth="session"
        parameters={[]}
        responseBody={`[
  {
    "id": "e5f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9012",
    "name": "CI deploys",
    "last_used_at": "2026-01-06T09:30:00.000Z",
    "created_at": "2026-01-04T12:00:00.000Z",
    "revoked_at": null
  }
]`}
      />

      <Endpoint
        method="POST"
        path="/keys"
        description="Mint a new named API key (201). The raw key is returned exactly once, in this response — store it securely; it cannot be retrieved again."
        auth="session"
        parameters={[
          {
            name: "name",
            type: "string",
            required: true,
            in: "body",
            description:
              "A label to recognize the key by later — where it runs, not what it does. 1–100 characters.",
          },
        ]}
        requestBody={`{
  "name": "CI deploys"
}`}
        responseBody={`{
  "api_key": "sk_live_9f2c1b8a7e4d3f60...",
  "message": "Store this key securely — it will not be shown again.",
  "key": {
    "id": "e5f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9012",
    "name": "CI deploys",
    "last_used_at": null,
    "created_at": "2026-01-04T12:00:00.000Z",
    "revoked_at": null
  }
}`}
      />

      <Endpoint
        method="DELETE"
        path="/keys/:id"
        description="Revoke an API key. Returns 204 No Content. Requests made with a revoked key stop authenticating immediately."
        auth="session"
        parameters={[
          {
            name: "id",
            type: "string",
            required: true,
            in: "path",
            description:
              "The id of the key to revoke — the value from the key's metadata, not the key itself. A key you do not own returns 404; revoking an already-revoked key still returns 204.",
          },
        ]}
      />
    </div>
  );
}
