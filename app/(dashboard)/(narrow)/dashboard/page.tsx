"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type WorkspaceDto } from "@/lib/apiClient";

// Dashboard home: manage workspaces. Auth is the session cookie — api() calls
// omit the API key and the cookie rides along on same-origin fetches.
export default function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspaces(await api<WorkspaceDto[]>("/workspaces"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setError(null);
    try {
      await api("/workspaces", { method: "POST", body: { name } });
      setName("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this workspace? Its documents will be kept.")) return;
    try {
      await api(`/workspaces/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card">
      <h1 className="text-base font-semibold">Workspaces</h1>
      <p className="mt-1 mb-4 text-sm text-muted">
        Organize documents into collections.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="New workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" disabled={!name.trim()} onClick={create}>
          Create
        </button>
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : workspaces.length === 0 ? (
        <p className="text-sm text-muted">
          No workspaces yet — create your first one above.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="flex items-center justify-between gap-3 row"
            >
              <div>
                <Link
                  href={`/workspaces/${ws.id}`}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {ws.name}
                </Link>
                <div className="font-mono text-xs text-muted">
                  {ws.document_count ?? 0} docs
                  {ws.has_template ? " · has template" : ""}
                </div>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => remove(ws.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
