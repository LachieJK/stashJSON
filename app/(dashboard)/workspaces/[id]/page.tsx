"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  api,
  type DocumentDto,
  type DocumentVersionDto,
  type TemplateDto,
  type WorkspaceDto,
} from "@/lib/apiClient";

// Workspace detail. Auth is the session cookie (no API key passed).
export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return (
    <>
      <p>
        <Link href="/dashboard" className="text-accent">
          ← All workspaces
        </Link>
      </p>
      <WorkspaceHeader id={id} />
      <TemplatePanel id={id} />
      <DocumentsPanel id={id} />
    </>
  );
}

function WorkspaceHeader({ id }: { id: string }) {
  const [ws, setWs] = useState<WorkspaceDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<WorkspaceDto>(`/workspaces/${id}`)
      .then(setWs)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <div className="card notice notice-error">{error}</div>;
  if (!ws) return <p className="text-sm text-muted">Loading workspace…</p>;

  return (
    <div className="card">
      <h1 className="text-base font-semibold">{ws.name}</h1>
      <p className="font-mono text-xs text-muted">{ws.id}</p>
    </div>
  );
}

function TemplatePanel({ id }: { id: string }) {
  const [schema, setSchema] = useState("");
  const [exists, setExists] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const t = await api<TemplateDto>(`/workspaces/${id}/template`);
      setSchema(JSON.stringify(t.json_schema, null, 2));
      setExists(true);
    } catch {
      // 404 = no template yet; leave the editor empty.
      setExists(false);
    }
  }, [id]);

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
      await api(`/workspaces/${id}/template`, { method: "DELETE" });
      setSchema("");
      setExists(false);
      setMessage({ ok: true, text: "Template deleted." });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="card">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        Template {exists && <span className="pill">active</span>}
      </h2>
      <p className="mt-1 mb-3 text-sm text-muted">
        A JSON Schema every document in this workspace must satisfy. Leave empty
        for none.
      </p>
      <textarea
        className="input min-h-[120px] font-mono text-[13px]"
        placeholder='{ "type": "object", "required": ["name"] }'
        value={schema}
        onChange={(e) => setSchema(e.target.value)}
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button className="btn" onClick={save} disabled={!schema.trim()}>
          Save template
        </button>
        {exists && (
          <button className="btn btn-danger" onClick={remove}>
            Delete template
          </button>
        )}
      </div>
      {message && (
        <p
          className={`notice mt-2.5 ${
            message.ok ? "notice-success" : "notice-error"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function DocumentsPanel({ id }: { id: string }) {
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [json, setJson] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await api<DocumentDto[]>(`/workspaces/${id}/documents`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
      <h2 className="text-base font-semibold">Documents</h2>
      <p className="mt-1 mb-3 text-sm text-muted">Newest first (up to 25).</p>

      <label className="label">New document JSON</label>
      <textarea
        className="input min-h-[120px] font-mono text-[13px]"
        placeholder='{ "hello": "world" }'
        value={json}
        onChange={(e) => setJson(e.target.value)}
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          public
        </label>
        <button className="btn" onClick={create} disabled={!json.trim()}>
          Create document
        </button>
      </div>

      {error && <p className="notice notice-error mt-3">{error}</p>}

      <div className="mt-4 flex flex-col gap-2">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted">No documents yet.</p>
        ) : (
          docs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onChanged={load} />
          ))
        )}
      </div>
    </div>
  );
}

function DocumentRow({
  doc,
  onChanged,
}: {
  doc: DocumentDto;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionDto[] | null>(null);

  async function togglePublic() {
    await api(`/documents/${doc.id}`, {
      method: "PATCH",
      body: { is_public: !doc.is_public },
    });
    onChanged();
  }

  async function remove() {
    if (!confirm("Delete this document?")) return;
    await api(`/documents/${doc.id}`, { method: "DELETE" });
    onChanged();
  }

  async function loadVersions() {
    setVersions(await api<DocumentVersionDto[]>(`/documents/${doc.id}/versions`));
  }

  return (
    <div className="rounded-lg border border-border bg-panel-2 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs">{doc.id}</span>
          <span className="pill">v{doc.version}</span>
          {doc.is_public && <span className="pill pill-public">public</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide" : "View"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={togglePublic}>
            {doc.is_public ? "Make private" : "Make public"}
          </button>
          <button className="btn btn-danger btn-sm" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      {open && (
        <>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">
            {JSON.stringify(doc.json_data, null, 2)}
          </pre>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={loadVersions}>
              Load version history
            </button>
          </div>
          {versions && (
            <div className="mt-2 flex flex-col gap-2">
              {versions.length === 0 ? (
                <p className="text-sm text-muted">No prior versions.</p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-lg border border-border bg-panel-2 px-3.5 py-3"
                  >
                    <span className="pill">v{v.version}</span>
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">
                      {JSON.stringify(v.json_data, null, 2)}
                    </pre>
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
