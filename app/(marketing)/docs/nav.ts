import type { Method } from "../_components";

/*
 * The docs taxonomy — single source of truth for the sidebar AND the pages.
 * Every endpoint here renders as an anchored <Endpoint> heading on its
 * group's page; `endpointId` derives the anchor slug from method + path, so
 * as long as both sides use the same strings the links can never drift.
 */

export type DocEndpoint = { method: Method; path: string; title: string };

export type DocGroup = {
  label: string;
  href: string;
  items: DocEndpoint[];
};

// Anchor slug for an endpoint heading, e.g. ("GET", "/documents/:id") →
// "get-documents-id". Used by the sidebar links and the Endpoint sections.
export function endpointId(method: Method, path: string): string {
  return `${method} ${path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const DOC_GROUPS: DocGroup[] = [
  {
    label: "Documents",
    href: "/docs/documents",
    items: [
      { method: "POST", path: "/documents", title: "Create a document" },
      { method: "GET", path: "/documents/:id", title: "Fetch a document" },
      { method: "PUT", path: "/documents/:id", title: "Replace a document" },
      { method: "PATCH", path: "/documents/:id", title: "Update a document" },
      { method: "DELETE", path: "/documents/:id", title: "Delete a document" },
    ],
  },
  {
    label: "Version history",
    href: "/docs/versions",
    items: [
      { method: "GET", path: "/documents/:id/versions", title: "List versions" },
      {
        method: "GET",
        path: "/documents/:id/versions/:version",
        title: "Fetch a version",
      },
    ],
  },
  {
    label: "Workspaces",
    href: "/docs/workspaces",
    items: [
      { method: "POST", path: "/workspaces", title: "Create a workspace" },
      { method: "GET", path: "/workspaces", title: "List workspaces" },
      { method: "GET", path: "/workspaces/:id", title: "Fetch a workspace" },
      {
        method: "GET",
        path: "/workspaces/:id/documents",
        title: "List workspace documents",
      },
      { method: "PUT", path: "/workspaces/:id", title: "Rename a workspace" },
      { method: "DELETE", path: "/workspaces/:id", title: "Delete a workspace" },
    ],
  },
  {
    label: "Workspace templates",
    href: "/docs/templates",
    items: [
      {
        method: "PUT",
        path: "/workspaces/:id/template",
        title: "Set or replace a template",
      },
      {
        method: "GET",
        path: "/workspaces/:id/template",
        title: "Fetch a template",
      },
      {
        method: "DELETE",
        path: "/workspaces/:id/template",
        title: "Remove a template",
      },
    ],
  },
  {
    label: "API keys",
    href: "/docs/keys",
    items: [
      { method: "GET", path: "/keys", title: "List API keys" },
      { method: "POST", path: "/keys", title: "Create an API key" },
      { method: "DELETE", path: "/keys/:id", title: "Revoke an API key" },
    ],
  },
  {
    label: "Misc",
    href: "/docs/misc",
    items: [{ method: "GET", path: "/health", title: "Health check" }],
  },
];

// Simple heading for an endpoint, looked up from the taxonomy so the sidebar
// subtabs and the page section headings can never disagree.
export function endpointTitle(
  method: Method,
  path: string,
): string | undefined {
  for (const group of DOC_GROUPS) {
    const hit = group.items.find(
      (item) => item.method === method && item.path === path,
    );
    if (hit) return hit.title;
  }
  return undefined;
}
