import type { ReactNode } from "react";
import { MethodBadge, type Method } from "../_components";
import { endpointId, endpointTitle } from "./nav";

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">
        {label}
      </div>
      <pre className="codeblock">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/*
 * One documented endpoint = one anchored section: a simple heading (looked up
 * from the taxonomy in nav.ts, so it always matches the sidebar subtab) with
 * the verb badge + route path beneath it. The anchor id is derived from
 * method + path with the same `endpointId` the sidebar uses, so subtab links
 * and page anchors can never drift apart. `scroll-mt` keeps the heading clear
 * of the floating navbar when jumped to.
 */
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
  const id = endpointId(method, path);
  const title = endpointTitle(method, path) ?? `${method} ${path}`;
  return (
    <section
      id={id}
      className="mt-10 scroll-mt-28 border-t border-border pt-8"
    >
      <h2 className="group flex flex-wrap items-center gap-2 text-lg leading-snug font-semibold tracking-tight">
        {title}
        <a
          href={`#${id}`}
          aria-label={`Link to ${title}`}
          className="font-mono text-sm font-normal text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text focus-visible:opacity-100"
        >
          #
        </a>
      </h2>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <MethodBadge method={method} />
        <code className="font-mono text-sm break-all">{path}</code>
      </div>
      <p className="mt-3 max-w-prose text-sm text-muted">{description}</p>
      {children ? (
        <div className="mt-3 max-w-prose text-sm text-muted">{children}</div>
      ) : null}
      {requestBody ? <CodeBlock label="Request body" code={requestBody} /> : null}
      {responseBody ? <CodeBlock label="Response" code={responseBody} /> : null}
    </section>
  );
}
