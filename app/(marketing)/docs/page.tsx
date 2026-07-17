import type { Metadata } from "next";
import { ErrorTabs, type ApiErrorDoc } from "./ErrorTabs";

export const metadata: Metadata = { title: "API overview · StashJSON docs" };

// One-liner definitions of the product's vocabulary. Each concept gets its
// depth in its own docs section — these are just the map legend.
const CONCEPTS: { term: string; definition: string }[] = [
  {
    term: "Document",
    definition:
      "A single JSON payload with a 16-character id and other metadata fields.",
  },
  {
    term: "Workspace",
    definition: "A named container that groups and organises related documents together.",
  },
  {
    term: "Template",
    definition:
      "A JSON Schema attached to a workspace that every document inside must conform to.",
  },
  {
    term: "Version",
    definition:
      "A snapshot of a document's previous JSON, kept automatically on every update.",
  },
  {
    term: "API key",
    definition:
      "A secret credential sent as X-API-Key which can be created and revoked from your dashboard.",
  },
];

/*
 * Every status the API can answer with, and the body it sends. The `detail`
 * strings are the real ones — traceable to lib/http.ts (handle, parseBody),
 * lib/auth.ts (requireUser), and lib/documents.ts (loadOwnedDocument,
 * assertCanRead) — not illustrations.
 */
const API_ERRORS: ApiErrorDoc[] = [
  {
    status: 400,
    title: "Bad request",
    explanation:
      "The body isn't valid JSON, a field is missing or the wrong type, a version isn't an integer, or a document doesn't match its workspace template. The detail names the field that failed.",
    body: `{
  "detail": "Validation error at json_data: Required"
}`,
  },
  {
    status: 401,
    title: "Not authenticated",
    explanation:
      "No credentials reached us, or the API key is unknown or revoked. Send a valid X-API-Key header — or, on the key-management routes, sign in to the web app so the session cookie travels with the request.",
    body: `{
  "detail": "Authentication required"
}`,
  },
  {
    status: 403,
    title: "Access denied",
    explanation:
      "Your credentials are valid, but the document belongs to someone else. Workspaces answer 404 in the same situation — a workspace you don't own is indistinguishable from one that doesn't exist.",
    body: `{
  "detail": "Access denied"
}`,
  },
  {
    status: 404,
    title: "Not found",
    explanation:
      "Nothing exists at that id, or nothing you own does. Also returned for a version number that was never written, and for a workspace that has no template.",
    body: `{
  "detail": "Document not found"
}`,
  },
  {
    status: 500,
    title: "Server error",
    explanation:
      "Something failed on our side. The detail is always this generic string — nothing about your request is echoed back. Retry; if it persists, it's ours to fix.",
    body: `{
  "detail": "Internal server error"
}`,
  },
];

export default function DocsOverviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">API Overview</h1>
      <p className="mt-3 max-w-prose text-muted">
        StashJSON is a REST API for storing JSON documents, organising
        them into workspaces, enforcing a JSON Schema per workspace, and getting
        automatic version history on every update. All responses are JSON and
        all field names are <code className="font-mono">snake_case</code>.
      </p>

      <h2 className="mt-10 text-lg font-semibold">Core concepts</h2>
      <dl className="mt-4 divide-y divide-border rounded-[var(--radius-card)] border border-border">
        {CONCEPTS.map((c) => (
          <div
            key={c.term}
            className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4"
          >
            <dt className="w-28 shrink-0 text-sm font-medium">{c.term}</dt>
            <dd className="text-sm text-muted">{c.definition}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-lg font-semibold">Base URL</h2>
      <pre className="codeblock mt-3">
        <code>https://api.stashjson.com</code>
      </pre>

      <h2 className="mt-10 text-lg font-semibold">Authentication</h2>
      <p className="mt-3 max-w-prose text-muted">
        Resource routes accept either an{" "}
        <code className="font-mono">X-API-Key</code> request header or a
        web-session cookie (the dashboard uses cookies; external clients use
        keys). Public documents are readable with no credentials; every write
        and every private read requires them.
      </p>
      <pre className="codeblock mt-3">
        <code>{`curl https://api.stashjson.com/workspaces \\
  -H "X-API-Key: sk_live_your_key_here"`}</code>
      </pre>
      <p className="mt-3 max-w-prose text-muted">
        Create and revoke keys from the account page in your dashboard after
        signing up — see the API keys section for the endpoints behind it.
      </p>

      <h2 className="mt-10 text-lg font-semibold">Errors</h2>
      <p className="mt-3 max-w-prose text-muted">
        Errors use standard HTTP status codes and return a JSON body with a
        single <code className="font-mono">detail</code> field describing what
        went wrong.
      </p>
      <ErrorTabs errors={API_ERRORS} />
    </div>
  );
}
