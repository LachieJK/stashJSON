"use client";

import { useState } from "react";

// The one command the page invites visitors to copy, with a copy button that
// confirms for a beat and resets.
const CURL = `curl -X POST https://api.stashjson.com/api/documents \\
  -H "X-API-Key: $STASH_KEY" -H "Content-Type: application/json" \\
  -d '{"json_data":{"status":"draft"}}'`;

export function CopyLine() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="group relative mt-8">
      <pre className="codeblock pr-16 whitespace-pre-wrap">
        <code>
          <span className="text-muted">$ </span>
          {CURL}
        </code>
      </pre>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(CURL);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
        className="absolute top-2 right-2 cursor-pointer rounded-md border border-border px-2 py-1 font-mono text-[10px] tracking-wide text-muted uppercase transition-colors hover:border-muted hover:text-text"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
