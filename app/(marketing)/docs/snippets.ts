import type { Method } from "../_components";

/*
 * Request-snippet generation for the API reference.
 *
 * Every documented endpoint renders the same call in three languages. Writing
 * them by hand would be ~60 snippets drifting out of sync with each other and
 * with the routes, so instead each <Endpoint> declares WHAT it calls (method,
 * path, body, auth) and this module renders HOW, once per language. Consistency
 * is structural rather than a review burden.
 *
 * Pure and server-safe: <Endpoint> generates the three strings at render time
 * and hands them to the client component that switches between them.
 */

export type Lang = "javascript" | "python" | "java";

// Order is the tab order. JavaScript is the default (see globals.css).
export const LANGS: { id: Lang; label: string }[] = [
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
];

export function isLang(value: unknown): value is Lang {
  return LANGS.some((l) => l.id === value);
}

/*
 * How a route authenticates, which decides the credential line in every
 * snippet. Mirrors lib/auth.ts:
 *   key     — requireUser / assertCanRead: an X-API-Key header (or a session
 *             cookie, but keys are what external clients use).
 *   session — requireSessionUser: the web session cookie ONLY; key management
 *             deliberately refuses X-API-Key.
 *   none    — open.
 */
export type Auth = "key" | "session" | "none";

export type Operation = {
  method: Method;
  path: string;
  body?: unknown;
  auth: Auth;
  // Whether the success response carries a JSON body (false for the 204s), so
  // snippets don't tell you to parse an empty response.
  returnsJson: boolean;
};

const BASE_URL = "https://api.stashjson.com";

// Sample ids per collection, so the snippets show a plausible URL rather than
// a ":id" placeholder. Keyed by the segment before the parameter.
const SAMPLE_IDS: Record<string, string> = {
  documents: "V1StGXR8Z5jdHi6B",
  workspaces: "b1f0c2a4-1e2d-4c3b-9a8f-0d1e2f3a4b5c",
  keys: "e5f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9012",
};

// "/documents/:id/versions/:version" → ".../documents/V1StGXR8Z5jdHi6B/versions/1"
function exampleUrl(path: string): string {
  const segments = path.split("/");
  const filled = segments.map((segment, i) => {
    if (segment === ":id") return SAMPLE_IDS[segments[i - 1]] ?? segment;
    if (segment === ":version") return "1";
    return segment;
  });
  return `${BASE_URL}${filled.join("/")}`;
}

function shift(lines: string[], spaces: number): string[] {
  const pad = " ".repeat(spaces);
  return lines.map((line) => (line ? pad + line : line));
}

// JSON body → lines, e.g. ['{', '  "name": "CI deploys"', '}'].
function jsonLines(body: unknown): string[] {
  return JSON.stringify(body, null, 2).split("\n");
}

// ---------------------------------------------------------------- JavaScript

function javascriptSnippet(op: Operation): string {
  const headers: string[] = [];
  if (op.auth === "key") {
    headers.push(`"X-API-Key": process.env.STASHJSON_API_KEY,`);
  }
  if (op.body) headers.push(`"Content-Type": "application/json",`);

  const options: string[] = [`method: "${op.method}",`];
  if (headers.length > 0) {
    options.push("headers: {", ...shift(headers, 2), "},");
  }
  // The browser attaches the session cookie itself — there is no header to set.
  if (op.auth === "session") options.push(`credentials: "include",`);
  if (op.body) {
    const json = jsonLines(op.body);
    options.push(
      `body: JSON.stringify(${json[0]}`,
      ...json.slice(1, -1),
      `${json[json.length - 1]}),`,
    );
  }

  const lines = [
    `const res = await fetch("${exampleUrl(op.path)}", {`,
    ...shift(options, 2),
    "});",
    "",
    op.returnsJson
      ? "const data = await res.json();"
      : "// 204 No Content — the response has no body.",
  ];
  return lines.join("\n");
}

// -------------------------------------------------------------------- Python

// JSON value → Python literal (true/false/null have no Python spelling, so the
// body is re-serialized rather than pasted).
function toPython(value: unknown, depth: number): string {
  const pad = (n: number) => "    ".repeat(n);
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${pad(depth + 1)}${toPython(v, depth + 1)}`);
    return `[\n${items.join(",\n")}\n${pad(depth)}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  const items = entries.map(
    ([k, v]) => `${pad(depth + 1)}${JSON.stringify(k)}: ${toPython(v, depth + 1)}`,
  );
  return `{\n${items.join(",\n")}\n${pad(depth)}}`;
}

function pythonSnippet(op: Operation): string {
  const preamble: string[] = [];
  if (op.auth !== "none") preamble.push("import os");
  preamble.push("import requests", "");
  if (op.auth === "session") {
    preamble.push(`SESSION_COOKIE = os.environ["STASHJSON_SESSION_COOKIE"]`, "");
  }

  const args: string[] = [`"${exampleUrl(op.path)}",`];
  if (op.auth === "key") {
    args.push(`headers={"X-API-Key": os.environ["STASHJSON_API_KEY"]},`);
  }
  if (op.auth === "session") args.push(`headers={"Cookie": SESSION_COOKIE},`);
  if (op.body) args.push(`json=${toPython(op.body, 1)},`);

  const lines = [
    ...preamble,
    `res = requests.${op.method.toLowerCase()}(`,
    ...shift(args, 4),
    ")",
    "",
    op.returnsJson
      ? "data = res.json()"
      : "# 204 No Content — the response has no body.",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------- Java

// java.net.http builder call for the verb, with the body publisher inlined as
// a text block. PATCH has no dedicated builder method.
function javaMethodCall(op: Operation): string[] {
  if (!op.body) {
    return op.method === "GET" ? [".GET()"] : [`.${op.method}()`];
  }

  // Indented relative to the builder chain; Java strips the text block's
  // incidental indentation against its closing delimiter.
  const json = shift(jsonLines(op.body), 4);
  const publisherOpen = `HttpRequest.BodyPublishers.ofString("""`;
  // Closes the text block, ofString(, and the verb call in one go.
  const bodyLines = [...json.slice(0, -1), `${json[json.length - 1]}"""))`];

  if (op.method === "PATCH") {
    return [`.method("PATCH", ${publisherOpen}`, ...bodyLines];
  }
  return [`.${op.method}(${publisherOpen}`, ...bodyLines];
}

function javaSnippet(op: Operation): string {
  const builder: string[] = [`.uri(URI.create("${exampleUrl(op.path)}"))`];
  if (op.auth === "key") {
    builder.push(`.header("X-API-Key", System.getenv("STASHJSON_API_KEY"))`);
  }
  if (op.auth === "session") builder.push(`.header("Cookie", sessionCookie)`);
  if (op.body) builder.push(`.header("Content-Type", "application/json")`);
  builder.push(...javaMethodCall(op), ".build();");

  const lines = [
    "HttpClient client = HttpClient.newHttpClient();",
    "",
    "HttpRequest request = HttpRequest.newBuilder()",
    ...shift(builder, 4),
    "",
    "HttpResponse<String> response =",
    "    client.send(request, HttpResponse.BodyHandlers.ofString());",
    "",
    op.returnsJson
      ? "String data = response.body();"
      : "// 204 No Content — response.body() is empty.",
  ];
  return lines.join("\n");
}

export function buildSnippets(op: Operation): Record<Lang, string> {
  return {
    javascript: javascriptSnippet(op),
    python: pythonSnippet(op),
    java: javaSnippet(op),
  };
}
