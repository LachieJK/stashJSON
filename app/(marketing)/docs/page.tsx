import type { Metadata } from "next";

export const metadata: Metadata = { title: "API overview · StashJSON docs" };

// One-liner definitions of the product's vocabulary. Each concept gets its
// depth in its own docs section — these are just the map legend.
const CONCEPTS: { term: string; definition: string }[] = [
  {
    term: "Document",
    definition:
      "A single JSON payload with a 16-character id — public or private.",
  },
  {
    term: "Workspace",
    definition: "A named container that groups related documents.",
  },
  {
    term: "Template",
    definition:
      "A JSON Schema attached to a workspace; every document written to it must conform.",
  },
  {
    term: "Version",
    definition:
      "A snapshot of a document's previous JSON, kept automatically on every update.",
  },
  {
    term: "API key",
    definition:
      "A secret credential sent as X-API-Key; created and revoked from your dashboard.",
  },
];

export default function DocsOverviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">API overview</h1>
      <p className="mt-3 max-w-prose text-muted">
        StashJSON is a REST API for storing arbitrary JSON documents, organizing
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
      <pre className="codeblock mt-3">
        <code>{`{
  "detail": "Not authenticated"
}`}</code>
      </pre>
    </div>
  );
}
