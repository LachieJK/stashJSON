// Tiny browser-side client for the StashJSON public API. Used by the dashboard.

type ApiOptions = {
  apiKey?: string | null;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.apiKey) headers["X-API-Key"] = opts.apiKey;

  const res = await fetch(`/api${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (data && typeof data.detail === "string" && data.detail) ||
      `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data as T;
}

// Response shapes (snake_case, matching the API).
export type DocumentDto = {
  id: string;
  json_data: unknown;
  is_public: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type DocumentVersionDto = {
  id: string;
  document_id: string;
  json_data: unknown;
  version: number;
  created_at: string;
};

export type WorkspaceDto = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  document_count?: number;
  has_template?: boolean;
};

export type TemplateDto = {
  id: string;
  workspace_id: string;
  json_schema: unknown;
  created_at: string;
  updated_at: string;
};
