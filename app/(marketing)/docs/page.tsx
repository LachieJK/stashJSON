import { Endpoint } from "./_components";

export default function DocsOverviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">API Overview</h1>
      <p className="mt-3 text-muted">
        StashJSON is a REST API for storing arbitrary JSON documents, organizing
        them into workspaces, enforcing a JSON Schema per workspace, and getting
        automatic version history on every update. All responses are JSON and all
        field names are <code className="font-mono">snake_case</code>.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Base URL</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">
        <code>https://api.stashjson.com</code>
      </pre>

      <h2 className="mt-8 text-lg font-semibold">Authentication</h2>
      <p className="mt-3 text-muted">
        Authenticate by sending your API key in the{" "}
        <code className="font-mono">X-API-Key</code> request header. Public
        documents are readable with no key; every write and every private read
        requires a valid key.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">
        <code>{`curl https://api.stashjson.com/api/workspaces \\
  -H "X-API-Key: sk_live_your_key_here"`}</code>
      </pre>
      <p className="mt-3 text-muted">
        You can create and rotate keys from the account page in your dashboard
        after signing up.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Errors</h2>
      <p className="mt-3 text-muted">
        Errors use standard HTTP status codes and return a JSON body with a
        single <code className="font-mono">detail</code> field describing what
        went wrong.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">
        <code>{`{
  "detail": "Not authenticated"
}`}</code>
      </pre>

      <h2 className="mt-8 text-lg font-semibold">Health &amp; account</h2>

      <Endpoint
        method="GET"
        path="/api/health"
        description="Liveness check. Requires no authentication."
        responseBody={`{
  "status": "ok"
}`}
      />

      <Endpoint
        method="POST"
        path="/api/auth/generate-key"
        description="Legacy anonymous onboarding — creates a new account and returns a fresh API key (201). Prefer signing up and managing keys in the dashboard account page instead."
        responseBody={`{
  "api_key": "sk_live_9f2c1b8a7e4d3f60...",
  "message": "Store this key securely — it will not be shown again."
}`}
      />

      <Endpoint
        method="DELETE"
        path="/api/auth/revoke-key"
        description="Permanently deletes the calling account together with all of its workspaces, documents, and versions. Returns 204 No Content. This cannot be undone."
      >
        Requires the <code className="font-mono">X-API-Key</code> header.
      </Endpoint>
    </div>
  );
}
