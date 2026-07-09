"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiKey } from "@/app/providers";
import {
  api,
  type DocumentDto,
  type DocumentVersionDto,
  type TemplateDto,
  type WorkspaceDto,
} from "@/lib/apiClient";

export default function WorkspacePage() {
  const { apiKey, ready } = useApiKey();
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!ready) return <p className="muted">Loading…</p>;
  if (!apiKey)
    return (
      <div className="card">
        <p className="muted">
          No API key set. <Link href="/">Go back</Link> to set one.
        </p>
      </div>
    );

  return (
    <>
      <p>
        <Link href="/">← All workspaces</Link>
      </p>
      <WorkspaceHeader apiKey={apiKey} id={id} />
      <TemplatePanel apiKey={apiKey} id={id} />
      <DocumentsPanel apiKey={apiKey} id={id} />
    </>
  );
}

function WorkspaceHeader({ apiKey, id }: { apiKey: string; id: string }) {
  const [ws, setWs] = useState<WorkspaceDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<WorkspaceDto>(`/workspaces/${id}`, { apiKey })
      .then(setWs)
      .catch((e) => setError((e as Error).message));
  }, [apiKey, id]);

  if (error) return <div className="card notice error">{error}</div>;
  if (!ws) return <p className="muted">Loading workspace…</p>;

  return (
    <div className="card">
      <h2>{ws.name}</h2>
      <p className="mono">{ws.id}</p>
    </div>
  );
}

function TemplatePanel({ apiKey, id }: { apiKey: string; id: string }) {
  const [schema, setSchema] = useState("");
  const [exists, setExists] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const t = await api<TemplateDto>(`/workspaces/${id}/template`, { apiKey });
      setSchema(JSON.stringify(t.json_schema, null, 2));
      setExists(true);
    } catch {
      // 404 = no template yet; leave the editor empty.
      setExists(false);
    }
  }, [apiKey, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(schema);
    } catch {
      setMessage({ ok: false, text: "Schema is not valid JSON." });
      return;
    }
    try {
      await api(`/workspaces/${id}/template`, {
        apiKey,
        method: "PUT",
        body: { json_schema: parsed },
      });
      setExists(true);
      setMessage({ ok: true, text: "Template saved." });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }

  async function remove() {
    setMessage(null);
    try {
      await api(`/workspaces/${id}/template`, { apiKey, method: "DELETE" });
      setSchema("");
      setExists(false);
      setMessage({ ok: true, text: "Template deleted." });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="card">
      <h2>Template {exists && <span className="pill">active</span>}</h2>
      <p className="hint">
        A JSON Schema every document in this workspace must satisfy. Leave empty
        for none.
      </p>
      <textarea
        placeholder='{ "type": "object", "required": ["name"] }'
        value={schema}
        onChange={(e) => setSchema(e.target.value)}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={save} disabled={!schema.trim()}>
          Save template
        </button>
        {exists && (
          <button className="danger" onClick={remove}>
            Delete template
          </button>
        )}
      </div>
      {message && (
        <p
          className={`notice ${message.ok ? "success" : "error"}`}
          style={{ marginTop: 10 }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function DocumentsPanel({ apiKey, id }: { apiKey: string; id: string }) {
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [json, setJson] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await api<DocumentDto[]>(`/workspaces/${id}/documents`, { apiKey }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Document body is not valid JSON.");
      return;
    }
    try {
      await api("/documents", {
        apiKey,
        method: "POST",
        body: { json_data: parsed, is_public: isPublic, workspace_id: id },
      });
      setJson("");
      setIsPublic(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card">
      <h2>Documents</h2>
      <p className="hint">Newest first (up to 25).</p>

      <label>New document JSON</label>
      <textarea
        placeholder='{ "hello": "world" }'
        value={json}
        onChange={(e) => setJson(e.target.value)}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <label style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />{" "}
          public
        </label>
        <button onClick={create} disabled={!json.trim()}>
          Create document
        </button>
      </div>

      {error && (
        <p className="notice error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      <div className="list" style={{ marginTop: 16 }}>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="muted">No documents yet.</p>
        ) : (
          docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              apiKey={apiKey}
              doc={doc}
              onChanged={load}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DocumentRow({
  apiKey,
  doc,
  onChanged,
}: {
  apiKey: string;
  doc: DocumentDto;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionDto[] | null>(null);

  async function togglePublic() {
    await api(`/documents/${doc.id}`, {
      apiKey,
      method: "PATCH",
      body: { is_public: !doc.is_public },
    });
    onChanged();
  }

  async function remove() {
    if (!confirm("Delete this document?")) return;
    await api(`/documents/${doc.id}`, { apiKey, method: "DELETE" });
    onChanged();
  }

  async function loadVersions() {
    const v = await api<DocumentVersionDto[]>(
      `/documents/${doc.id}/versions`,
      { apiKey },
    );
    setVersions(v);
  }

  return (
    <div className="item">
      <div className="spread">
        <div>
          <span className="mono">{doc.id}</span>{" "}
          <span className="pill">v{doc.version}</span>{" "}
          {doc.is_public && <span className="pill public">public</span>}
        </div>
        <div className="row">
          <button className="secondary small" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "View"}
          </button>
          <button className="secondary small" onClick={togglePublic}>
            {doc.is_public ? "Make private" : "Make public"}
          </button>
          <button className="danger small" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      {open && (
        <>
          <pre>{JSON.stringify(doc.json_data, null, 2)}</pre>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="secondary small" onClick={loadVersions}>
              Load version history
            </button>
          </div>
          {versions && (
            <div className="list" style={{ marginTop: 8 }}>
              {versions.length === 0 ? (
                <p className="muted">No prior versions.</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="item">
                    <span className="pill">v{v.version}</span>
                    <pre>{JSON.stringify(v.json_data, null, 2)}</pre>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
