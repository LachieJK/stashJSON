"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

type ApiKeyDto = {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

type CreatedKey = { api_key: string; key: ApiKeyDto };

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyDto[]>([]);
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<CreatedKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await api<ApiKeyDto[]>("/keys"));
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
      const created = await api<CreatedKey>("/keys", {
        method: "POST",
        body: { name },
      });
      setRevealed(created);
      setName("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any client using it will stop working.")) return;
    try {
      await api(`/keys/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card">
      <h2 className="text-base font-semibold">API keys</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        Use these to call the StashJSON API with the{" "}
        <code className="font-mono">X-API-Key</code> header.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="Key name (e.g. production server)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" disabled={!name.trim()} onClick={create}>
          Create key
        </button>
      </div>

      {revealed && (
        <div className="notice notice-success mb-4">
          New key <strong>{revealed.key.name}</strong> created. Copy it now — it
          won&apos;t be shown again:
          <br />
          <span className="font-mono break-all">{revealed.api_key}</span>
        </div>
      )}
      {error && <p className="notice notice-error mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted">No active keys.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel-2 px-3.5 py-3"
            >
              <div>
                <div className="font-semibold">{k.name}</div>
                <div className="font-mono text-xs text-muted">
                  created {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at
                    ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`
                    : " · never used"}
                </div>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => revoke(k.id)}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
