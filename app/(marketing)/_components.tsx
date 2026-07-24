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
