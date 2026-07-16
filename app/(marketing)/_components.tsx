export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Token-backed colour per HTTP verb — the sanctioned colour pops on the
// monochrome base (see the design brief's badge exception). Shared by the
// docs' Endpoint sections, the docs sidebar's verb column, and the landing
// page's how-it-works steps.
export const METHOD_TEXT_COLORS: Record<Method, string> = {
  GET: "text-info",
  POST: "text-ok",
  PUT: "text-warn",
  PATCH: "text-warn",
  DELETE: "text-danger",
};

const METHOD_COLORS: Record<Method, string> = {
  GET: `${METHOD_TEXT_COLORS.GET} border-info`,
  POST: `${METHOD_TEXT_COLORS.POST} border-ok`,
  PUT: `${METHOD_TEXT_COLORS.PUT} border-warn`,
  PATCH: `${METHOD_TEXT_COLORS.PATCH} border-warn`,
  DELETE: `${METHOD_TEXT_COLORS.DELETE} border-danger`,
};

export function MethodBadge({ method }: { method: Method }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${METHOD_COLORS[method]}`}
    >
      {method}
    </span>
  );
}

/*
 * The living document — the landing hero's demo object. One JSON document
 * cycles v1 → v2 → v3 on a pure-CSS loop (keyframes in globals.css) while the
 * superseded versions accumulate beneath it as dimmed snapshot rows: the
 * "nothing is ever lost" thesis, shown rather than told.
 *
 * The v3 state is the only element in normal flow (so the block reserves its
 * height and no layout ever shifts); v1/v2 are absolutely-stacked overlays.
 * Under prefers-reduced-motion the global guard collapses the animations and
 * the base styles freeze the demo on its final frame.
 */

const DOC_ID = "tm4xVd91LqPz8aQ3";

type DocState = {
  version: 1 | 2 | 3;
  status: string;
  edits: number;
  // Whether this state's write just changed status/edits (highlighted in ok-green).
  fresh: boolean;
};

const DOC_STATES: DocState[] = [
  { version: 1, status: "draft", edits: 1, fresh: false },
  { version: 2, status: "in review", edits: 2, fresh: true },
  { version: 3, status: "shipped", edits: 3, fresh: true },
];

// Keys/punctuation muted, values full-contrast, the just-written values in
// ok-green — colour marks the delta, per the brief's code-accent exception.
function DocJson({ state }: { state: DocState }) {
  const changed = state.fresh ? "text-ok" : "";
  return (
    <pre className="p-3 font-mono text-xs leading-relaxed">
      <code>
        <span className="text-muted">{"{"}</span>
        {"\n  "}
        <span className="text-muted">&quot;title&quot;:</span>{" "}
        <span>&quot;Ship the launch post&quot;</span>
        <span className="text-muted">,</span>
        {"\n  "}
        <span className="text-muted">&quot;status&quot;:</span>{" "}
        <span className={changed}>&quot;{state.status}&quot;</span>
        <span className="text-muted">,</span>
        {"\n  "}
        <span className="text-muted">&quot;edits&quot;:</span>{" "}
        <span className={changed}>{state.edits}</span>
        {"\n"}
        <span className="text-muted">{"}"}</span>
      </code>
    </pre>
  );
}

export function LivingDocument() {
  return (
    <div className="mx-auto mt-14 w-full max-w-md text-left">
      <div className="codeblock overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="truncate font-mono text-[11px] text-muted">
            documents/{DOC_ID}
          </span>
          <span className="pill relative">
            {/* v3 in flow sizes the pill; v1/v2 overlay it. */}
            <span className="doc-cycle-3">v3</span>
            <span
              className="doc-cycle-1 absolute inset-0 flex items-center justify-center"
              aria-hidden
            >
              v1
            </span>
            <span
              className="doc-cycle-2 absolute inset-0 flex items-center justify-center"
              aria-hidden
            >
              v2
            </span>
          </span>
        </div>
        <div className="relative">
          <div className="doc-cycle-3">
            <DocJson state={DOC_STATES[2]} />
          </div>
          <div className="doc-cycle-1 absolute inset-0" aria-hidden>
            <DocJson state={DOC_STATES[0]} />
          </div>
          <div className="doc-cycle-2 absolute inset-0" aria-hidden>
            <DocJson state={DOC_STATES[1]} />
          </div>
        </div>
      </div>

      {/* Superseded versions stack beneath, newest first. Opacity-only, so
       * the rows always occupy their space and nothing jumps. */}
      <div
        className="doc-history-2 mt-2 flex items-center justify-between rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-muted"
        aria-hidden
      >
        <span>v2 · snapshot retained</span>
        <span>2 min ago</span>
      </div>
      <div
        className="doc-history-1 mt-2 flex items-center justify-between rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-muted"
        aria-hidden
      >
        <span>v1 · snapshot retained</span>
        <span>5 min ago</span>
      </div>

      <p className="sr-only">
        Demo: a document updated from version 1 to version 3, with every
        previous version kept as a retrievable snapshot.
      </p>
    </div>
  );
}
