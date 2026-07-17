import type { ReactNode } from "react";
import { MethodBadge, type Method } from "../_components";
import { RequestSnippet } from "./RequestSnippet";
import { buildSnippets, type Auth } from "./snippets";
import { endpointId, endpointTitle } from "./nav";

/*
 * One documented endpoint = one anchored section with the same four
 * subsections, every time: Description, Parameters, Request, Response. The
 * shape is enforced here rather than trusted to each page, so no endpoint can
 * quietly ship with a section missing.
 */

// Where a parameter travels: in the URL path, the query string, or the body.
export type ParamIn = "path" | "query" | "body";

export type Param = {
  name: string;
  // The JSON type as the API sees it, e.g. "string", "object", "boolean".
  type: string;
  required: boolean;
  in: ParamIn;
  description: string;
};

function Subsection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="eyebrow mb-1.5">{label}</h3>
      {children}
    </div>
  );
}

/*
 * A labelled code sample — the resource's JSON shape at the top of each page.
 * Carries the same eyebrow label as an endpoint's Request and Response, so
 * every codeblock in the docs announces itself the same way instead of hiding
 * its title in a leading // comment.
 */
export function CodeSample({ label, code }: { label: string; code: string }) {
  return (
    <div className="mt-6">
      <h2 className="eyebrow mb-1.5">{label}</h2>
      <pre className="codeblock">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/*
 * Stripe-style parameter rows — name, type, where it goes, whether it is
 * required, then what it does. They hang off a hairline rail on ticks, the
 * same tree idiom as the docs sidebar, so a parameter list reads as a branch
 * of the endpoint rather than as a table.
 */
function ParamList({ params }: { params: Param[] }) {
  if (params.length === 0) {
    return <p className="text-sm text-muted">No parameters.</p>;
  }
  return (
    <ul className="param-list">
      {params.map((p) => (
        <li key={`${p.in}-${p.name}`} className="param-item">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <code className="font-mono text-sm font-medium">{p.name}</code>
            <span className="font-mono text-xs text-muted">
              {p.type} · {p.in}
            </span>
            {/* Required vs optional is weight and contrast, not colour. */}
            <span
              className={`font-mono text-[10px] tracking-[0.15em] uppercase ${
                p.required ? "font-semibold text-text" : "text-muted"
              }`}
            >
              {p.required ? "Required" : "Optional"}
            </span>
          </div>
          <p className="mt-1 max-w-prose text-[13px] text-muted">
            {p.description}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function Endpoint({
  method,
  path,
  description,
  parameters,
  requestBody,
  responseBody,
  auth = "key",
}: {
  method: Method;
  path: string;
  description: string;
  parameters: Param[];
  // The request body as a JSON string — the source for all three language
  // snippets, so the payload is written once and never drifts between them.
  requestBody?: string;
  // Omitted for the 204s, which fall back to the status-line snippet below.
  responseBody?: string;
  auth?: Auth;
}) {
  const id = endpointId(method, path);
  const title = endpointTitle(method, path) ?? `${method} ${path}`;
  const snippets = buildSnippets({
    method,
    path,
    body: requestBody ? JSON.parse(requestBody) : undefined,
    auth,
    returnsJson: responseBody !== undefined,
  });

  return (
    <section
      id={id}
      className="relative mt-12 scroll-mt-28 border-t border-border pt-8"
    >
      {/* Marks the rule's left terminus — the landing page's tick idiom. */}
      <span className="tick tick-tl" aria-hidden />

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

      <Subsection label="Description">
        <p className="max-w-prose text-sm text-muted">{description}</p>
      </Subsection>

      <Subsection label="Parameters">
        <ParamList params={parameters} />
      </Subsection>

      <RequestSnippet snippets={snippets} endpointTitle={title} />

      <Subsection label="Response">
        <pre className="codeblock">
          <code>{responseBody ?? "HTTP/1.1 204 No Content"}</code>
        </pre>
      </Subsection>
    </section>
  );
}
