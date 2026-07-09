"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApiKey } from "@/app/providers";
import { api, type WorkspaceDto } from "@/lib/apiClient";

export default function HomePage() {
  const { apiKey, ready } = useApiKey();

  if (!ready) return <p className="muted">Loading…</p>;

  return (
    <>
      <ApiKeyCard />
      {apiKey ? (
        <WorkspacesCard apiKey={apiKey} />
      ) : (
        <div className="card">
          <h2>Workspaces</h2>
          <p className="hint">Set or generate an API key above to get started.</p>
        </div>
      )}
    </>
  );
}

function ApiKeyCard() {
  const { apiKey, setApiKey } = useApiKey();
  const [draft, setDraft] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ api_key: string }>("/auth/generate-key", {
        method: "POST",
        body: {},
      });
      setGenerated(res.api_key);
      setApiKey(res.api_key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="spread">
        <div>
          <h2>API key</h2>
          <p className="hint">
            The dashboard uses your API key just like the public API does.
          </p>
        </div>
        {apiKey && (
          <button className="danger small" onClick={() => setApiKey(null)}>
            Forget key
          </button>
        )}
      </div>

      {apiKey ? (
        <p className="mono">
          Using key: {apiKey.slice(0, 6)}…{apiKey.slice(-4)}
        </p>
      ) : (
        <div className="row">
          <input
            type="text"
            placeholder="Paste an existing API key"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            className="secondary"
            disabled={!draft.trim()}
            onClick={() => setApiKey(draft.trim())}
          >
            Save
          </button>
          <button onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Generate new key"}
          </button>
        </div>
      )}

      {generated && (
        <p className="notice success" style={{ marginTop: 12 }}>
          New key created and saved. Copy it now — it won&apos;t be shown again:
          <br />
          <span className="mono">{generated}</span>
        </p>
      )}
      {error && (
        <p className="notice error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function WorkspacesCard({ apiKey }: { apiKey: string }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspaces(await api<WorkspaceDto[]>("/workspaces", { apiKey }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setError(null);
    try {
      await api("/workspaces", { apiKey, method: "POST", body: { name } });
      setName("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this workspace? Its documents will be kept.")) return;
    try {
      await api(`/workspaces/${id}`, { apiKey, method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card">
      <h2>Workspaces</h2>
      <p className="hint">Organize documents into collections.</p>

      <div className="row" style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="New workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button disabled={!name.trim()} onClick={create}>
          Create
        </button>
      </div>

      {error && <p className="notice error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : workspaces.length === 0 ? (
        <p className="muted">No workspaces yet.</p>
      ) : (
        <div className="list">
          {workspaces.map((ws) => (
            <div key={ws.id} className="item spread">
              <div>
                <Link href={`/workspaces/${ws.id}`}>
                  <strong>{ws.name}</strong>
                </Link>
                <div className="mono">
                  {ws.document_count ?? 0} docs
                  {ws.has_template ? " · has template" : ""}
                </div>
              </div>
              <button className="danger small" onClick={() => remove(ws.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
