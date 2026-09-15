"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ResourceOptions } from "@/lib/usage";
import {
  CREDS,
  RANGES,
  usageQuery,
  type CredFilter,
  type Range,
  type UsageFilters,
} from "@/lib/usageFilters";

/*
 * The three settled controls (range, credential, resource) — see #60. The
 * page is a server component that reads them from the URL, so the controls'
 * only job is to write a new URL: `router.replace` re-renders the page with
 * the new query and nothing is held in client state. The default range is
 * omitted from the URL so a fresh `/usage` link stays clean.
 */

const CRED_LABELS: Record<CredFilter, string> = {
  all: "All",
  api_key: "API key",
  session: "Dashboard",
  none: "Anonymous",
};

export function UsageControls({
  filters,
  resources,
}: {
  filters: UsageFilters;
  resources: ResourceOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function set(patch: Partial<UsageFilters>) {
    const qs = usageQuery({ ...filters, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const detached = resources.documents.filter((d) => d.workspaceId === null);
  // A deep-linked resource outside the picker's window still needs to show as
  // selected rather than silently reading "All resources".
  const known =
    resources.workspaces.some((w) => w.id === filters.resource) ||
    resources.documents.some((d) => d.id === filters.resource);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">
      <Segmented
        label="Time range"
        value={filters.range}
        options={RANGES.map((r) => ({ key: r, label: r }))}
        onChange={(range) => set({ range: range as Range })}
      />
      <Segmented
        label="Credential"
        value={filters.cred}
        options={CREDS.map((c) => ({ key: c, label: CRED_LABELS[c] }))}
        onChange={(cred) => set({ cred: cred as CredFilter })}
      />
      <select
        aria-label="Resource"
        className="input h-7 w-auto py-0 text-[11px]"
        value={filters.resource ?? ""}
        onChange={(e) => set({ resource: e.target.value || null })}
      >
        <option value="">All resources</option>
        {filters.resource && !known ? (
          <option value={filters.resource}>{filters.resource}</option>
        ) : null}
        {resources.workspaces.map((w) => (
          <optgroup key={w.id} label={`workspace: ${w.name}`}>
            <option value={w.id}>{w.name} (whole workspace)</option>
            {resources.documents
              .filter((d) => d.workspaceId === w.id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                </option>
              ))}
          </optgroup>
        ))}
        {detached.length > 0 ? (
          <optgroup label="no workspace">
            {detached.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex overflow-hidden rounded border border-border"
    >
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
