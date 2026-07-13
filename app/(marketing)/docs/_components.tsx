import type { ReactNode } from "react";
import { MethodBadge, type Method } from "../_components";

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <pre className="codeblock">
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
        <MethodBadge method={method} />
        <code className="font-mono text-sm break-all">{path}</code>
      </div>
      <p className="mt-3 text-sm text-muted">{description}</p>
      {children ? <div className="mt-3 text-sm text-muted">{children}</div> : null}
      {requestBody ? <CodeBlock label="Request body" code={requestBody} /> : null}
      {responseBody ? <CodeBlock label="Response" code={responseBody} /> : null}
    </div>
  );
}
