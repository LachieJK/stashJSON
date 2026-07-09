import type { ReactNode } from "react";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Tailwind text/border color utilities per HTTP verb.
const METHOD_COLORS: Record<Method, string> = {
  GET: "text-accent border-accent",
  POST: "text-ok border-ok",
  PUT: "text-amber-500 border-amber-500",
  PATCH: "text-amber-500 border-amber-500",
  DELETE: "text-danger border-danger",
};

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Endpoint({
  method,
  path,
  description,
  requestBody,
  responseBody,
  children,
}: {
  method: Method;
  path: string;
  description: string;
  requestBody?: string;
  responseBody?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${METHOD_COLORS[method]}`}
        >
          {method}
        </span>
        <code className="font-mono text-sm break-all">{path}</code>
      </div>
      <p className="mt-3 text-sm text-muted">{description}</p>
      {children ? <div className="mt-3 text-sm text-muted">{children}</div> : null}
      {requestBody ? <CodeBlock label="Request body" code={requestBody} /> : null}
      {responseBody ? <CodeBlock label="Response" code={responseBody} /> : null}
    </div>
  );
}
