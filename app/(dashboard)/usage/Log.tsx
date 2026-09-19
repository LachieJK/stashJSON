"use client";

import { useState, useTransition } from "react";
import { statusClassOf } from "@/lib/statusClass";
import type { UsageFilters } from "@/lib/usageFilters";
import { loadMoreEntries } from "./actions";
import { CLASS_COLOR } from "./charts";
import { ago } from "./format";
import type { ClientLogEntry, ClientLogPage } from "./logPage";

/*
 * The Log section: the raw entries as monospace lines, newest first —
 * `ago · ● status · method · path · ms · who`, the dot in the status class's
 * colour and the status number beside it so colour is never the only cue.
 * The first page is server-rendered; "Load more" appends the next through
 * the `loadMoreEntries` action, with the cursor in client state (the URL
 * holds the filters, not the scroll position). "ago" is measured from the
 * page's own clock so the server pass and hydration agree.
 */
export function Log({
  initial,
  filters,
  now,
}: {
  initial: ClientLogPage;
  filters: UsageFilters;
  now: number;
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    setFailed(false);
    startTransition(async () => {
      try {
        const page = await loadMoreEntries(filters, cursor);
        setEntries((prev) => [...prev, ...page.entries]);
        setCursor(page.nextCursor);
      } catch {
        setFailed(true);
      }
    });
  }

  if (entries.length === 0) {
    return <p className="font-mono text-[11px] text-muted">No requests in this range.</p>;
  }
  return (
    <>
      <pre className="codeblock max-h-96 overflow-auto text-[11px] leading-5">
        {entries.map((e) => (
          <Line key={e.id} entry={e} now={now} />
        ))}
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        {cursor ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={pending}
            className="link disabled:opacity-60"
          >
            {pending ? "Loading…" : "Load more"}
          </button>
        ) : (
          <span>End of range.</span>
        )}
        {failed ? <span className="text-danger">Could not load more — try again.</span> : null}
      </div>
    </>
  );
}

function Line({ entry: e, now }: { entry: ClientLogEntry; now: number }) {
  return (
    <div className="flex gap-3">
      <span className="w-14 shrink-0 text-muted">{ago(e.at, now)}</span>
      <span className="w-3 shrink-0" style={{ color: CLASS_COLOR[statusClassOf(e.status)] }} aria-hidden>
        ●
      </span>
      <span className="w-8 shrink-0 tabular-nums">{e.status}</span>
      <span className="w-12 shrink-0">{e.method}</span>
      <span className="min-w-0 flex-1 truncate" title={e.path}>
        {e.path}
      </span>
      <span className="w-14 shrink-0 text-right text-muted tabular-nums">{e.durationMs}ms</span>
      <span className="w-32 shrink-0 truncate text-right" title={e.who}>
        {e.who}
      </span>
    </div>
  );
}
