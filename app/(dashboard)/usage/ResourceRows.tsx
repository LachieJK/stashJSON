import Link from "next/link";
import type { WorkspaceRow } from "@/lib/usage";
import { usageQuery, type UsageFilters } from "@/lib/usageFilters";
import { Sparkline } from "./charts";

/*
 * The What section: workspaces as group rows, documents beneath, busiest
 * first. Every name is a link that sets the resource filter — the per-
 * resource view is a filter on this page, not a page of its own (#60). A
 * deleted document or workspace keeps its row under its id, because the log
 * keeps snapshots by design (ADR-0002); the row says so rather than
 * disappearing.
 */
export function ResourceRows({
  rows,
  filters,
}: {
  rows: WorkspaceRow[];
  filters: UsageFilters;
}) {
  if (rows.length === 0) {
    return <p className="font-mono text-[11px] text-muted">No requests in this range.</p>;
  }
  const filterHref = (id: string) => `/usage?${usageQuery({ ...filters, resource: id })}`;

  return (
    <ul className="flex flex-col">
      {rows.map((ws) => (
        <li key={ws.id ?? "detached"} className="border-t border-border py-3 first:border-t-0">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            {ws.id === null ? (
              <span className="text-muted">no workspace</span>
            ) : (
              <Link href={filterHref(ws.id)} className="link">
                {ws.name ?? ws.id}/
              </Link>
            )}
            {ws.id !== null && !ws.exists ? <span className="pill text-[10px]">deleted</span> : null}
            {ws.probed ? <ProbedBadge /> : null}
            <span className="ml-auto tabular-nums">{ws.total.toLocaleString("en-US")}</span>
            <Refused n={ws.refused} />
          </div>
          {ws.documents.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {ws.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <Sparkline values={d.series} width={72} height={18} />
                  <Link href={filterHref(d.id)} className="truncate hover:underline">
                    {d.id}
                  </Link>
                  {d.isPublic ? <span className="pill pill-public text-[10px]">public</span> : null}
                  {!d.exists ? <span className="pill text-[10px]">deleted</span> : null}
                  {d.probed ? <ProbedBadge /> : null}
                  <span className="ml-auto tabular-nums">{d.total.toLocaleString("en-US")}</span>
                  <Refused n={d.refused} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The probed warning's badge: the rule fired for this resource in the trailing hour. */
function ProbedBadge() {
  return (
    <span className="rounded-sm border border-danger px-1 text-[10px] text-danger">probed</span>
  );
}

/** Refused (401/403/404) in the range; warn colour once there are any. */
function Refused({ n }: { n: number }) {
  return (
    <span className={`w-20 text-right tabular-nums ${n > 0 ? "text-warn" : "text-muted"}`}>
      {n > 0 ? `${n.toLocaleString("en-US")} refused` : "—"}
    </span>
  );
}
