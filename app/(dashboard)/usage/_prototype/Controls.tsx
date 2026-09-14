"use client";

/*
 * PROTOTYPE ONLY — the three settled controls (range, credential, resource),
 * reflected in the URL so a view is shareable. Shared by every variant; a
 * variant may hide the resource picker when it owns resource selection.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DOCUMENTS, WORKSPACES, type CredFilter, type Filters, type Range } from "./data";

const RANGES: Range[] = ["1h", "24h", "7d", "30d"];
const CREDS: { key: CredFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "api_key", label: "API key" },
  { key: "session", label: "Dashboard" },
  { key: "none", label: "Anonymous" },
];

export function useFilters(): [Filters, (patch: Partial<Filters>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const range = (params.get("range") as Range) ?? "24h";
  const cred = (params.get("cred") as CredFilter) ?? "all";
  const resource = params.get("resource");
  const set = (patch: Partial<Filters>) => {
    const q = new URLSearchParams(params.toString());
    const next = { range, cred, resource, ...patch };
    q.set("range", next.range);
    if (next.cred === "all") q.delete("cred");
    else q.set("cred", next.cred);
    if (next.resource) q.set("resource", next.resource);
    else q.delete("resource");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return [{ range: RANGES.includes(range) ? range : "24h", cred, resource }, set];
}

export function Controls({
  filters,
  set,
  showResource = true,
}: {
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  showResource?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">
      <Seg
        value={filters.range}
        options={RANGES.map((r) => ({ key: r, label: r }))}
        onChange={(range) => set({ range: range as Range })}
      />
      <Seg
        value={filters.cred}
        options={CREDS}
        onChange={(cred) => set({ cred: cred as CredFilter })}
      />
      {showResource && (
        <select
          className="input h-7 w-auto py-0 text-[11px]"
          value={filters.resource ?? ""}
          onChange={(e) => set({ resource: e.target.value || null })}
        >
          <option value="">All resources</option>
          {WORKSPACES.map((w) => (
            <optgroup key={w.id} label={`workspace: ${w.name}`}>
              <option value={w.id}>{w.name} (whole workspace)</option>
              {DOCUMENTS.filter((d) => d.ws === w.id).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </div>
  );
}

function Seg({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { key: string; label: string }[];
  onChange: (k: string) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded border border-border">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`cursor-pointer px-2.5 py-1 transition-colors ${
            value === o.key ? "bg-text text-bg" : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
