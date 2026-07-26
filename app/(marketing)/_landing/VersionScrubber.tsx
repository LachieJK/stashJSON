"use client";

import { useRef, useState } from "react";
import { MethodBadge, type Method } from "../_components";

// The hero's live document: a rail the visitor sweeps to scrub one document
// through v1 → v5, with the fields that changed at each revision lit. The rail
// and the pane share one revision index, so they live in one component.

type Rev = {
  version: number;
  at: string;
  method: Method;
  data: Record<string, string | number | boolean>;
};

const REVS: Rev[] = [
  {
    version: 1,
    at: "5 days ago",
    method: "POST",
    data: { title: "Ship the launch post", status: "draft", edits: 1 },
  },
  {
    version: 2,
    at: "4 days ago",
    method: "PUT",
    data: { title: "Ship the launch post", status: "in review", edits: 2 },
  },
  {
    version: 3,
    at: "2 days ago",
    method: "PATCH",
    data: {
      title: "Ship the launch post",
      status: "in review",
      edits: 3,
      reviewer: "dana",
    },
  },
  {
    version: 4,
    at: "yesterday",
    method: "PUT",
    data: {
      title: "Ship the launch post v2",
      status: "approved",
      edits: 4,
      reviewer: "dana",
    },
  },
  {
    version: 5,
    at: "2 min ago",
    method: "PATCH",
    data: {
      title: "Ship the launch post v2",
      status: "shipped",
      edits: 5,
      reviewer: "dana",
      public: true,
    },
  },
];

function formatValue(v: string | number | boolean) {
  return typeof v === "string" ? `"${v}"` : String(v);
}

// The document at the scrubbed revision; keys that differ from the previous
// revision are lit, so sweeping the rail shows the deltas travelling.
function DocPane({ index }: { index: number }) {
  const rev = REVS[index];
  const prev = index > 0 ? REVS[index - 1].data : {};
  const entries = Object.entries(rev.data);

  return (
    <div className="codeblock overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="truncate font-mono text-[11px] text-muted">
          documents/tm4xVd91LqPz8aQ3
        </span>
        <span className="flex items-center gap-2">
          <MethodBadge method={rev.method} />
          <span className="pill">v{rev.version}</span>
        </span>
      </div>
      <pre className="p-4 font-mono text-xs leading-relaxed">
        <code>
          <span className="text-muted">{"{"}</span>
          {entries.map(([k, v], i) => {
            const changed =
              formatValue(prev[k as keyof typeof prev]) !== formatValue(v);
            return (
              <span key={k}>
                {"\n  "}
                <span className="text-muted">&quot;{k}&quot;:</span>{" "}
                <span className={changed ? "text-ok" : ""}>
                  {formatValue(v)}
                </span>
                {i < entries.length - 1 ? (
                  <span className="text-muted">,</span>
                ) : null}
              </span>
            );
          })}
          {"\n"}
          <span className="text-muted">{"}"}</span>
        </code>
      </pre>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 font-mono text-[11px] text-muted">
        <span>written {rev.at}</span>
        <span>
          {index === REVS.length - 1 ? "current" : "snapshot retained"}
        </span>
      </div>
    </div>
  );
}

// The rail: diamonds per revision on a hairline, filled up to the current one.
// Exposed as a slider so the arrow keys reach it without a pointer.
function VersionRail({
  index,
  onIndex,
}: {
  index: number;
  onIndex: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onIndex(Math.round(t * (REVS.length - 1)));
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Document version"
      aria-valuemin={1}
      aria-valuemax={REVS.length}
      aria-valuenow={index + 1}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
        if (e.key === "ArrowRight")
          onIndex(Math.min(REVS.length - 1, index + 1));
      }}
      className="relative mt-6 cursor-ew-resize py-6 select-none"
    >
      <div className="h-px w-full bg-border" />
      <div
        className="absolute top-1/2 left-0 h-px bg-text transition-[width] duration-150"
        style={{ width: `${(index / (REVS.length - 1)) * 100}%` }}
      />
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
        {REVS.map((r, i) => (
          <span key={r.version} className="relative flex flex-col items-center">
            <span
              className={`size-2.5 rotate-45 border transition-colors ${
                i <= index ? "border-text bg-text" : "border-border bg-bg"
              }`}
            />
            <span
              className={`absolute top-5 font-mono text-[10px] transition-colors ${
                i === index ? "text-text" : "text-muted"
              }`}
            >
              v{r.version}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function VersionScrubber() {
  const [rev, setRev] = useState(0);

  return (
    <>
      <p className="mt-6 font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
        ← drag to scrub →
      </p>
      <VersionRail index={rev} onIndex={setRev} />
      <div className="mt-8">
        <DocPane index={rev} />
      </div>
    </>
  );
}
