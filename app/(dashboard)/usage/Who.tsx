import { ACTOR_ROW_LIMIT, type Actors } from "@/lib/usage";
import { ago } from "./format";

/*
 * The Who section: a part-to-whole strip of the range's requests by who made
 * them, then the rows beneath — your own keys, then other accounts as
 * handles. The three colours are fixed: You = ink, Other accounts = info,
 * Anonymous = muted — the same info token the traffic chart gives 429s, but
 * the two never share a chart, and each strip carries its own legend.
 *
 * Every handle arrived here already pseudonymised (`lib/usage.ts`); this
 * component never sees an account id and could not leak one.
 */
export function Who({ actors, now }: { actors: Actors; now: number }) {
  const { totals, keys, handles } = actors;
  const total = totals.you + totals.others + totals.anonymous;
  if (total === 0) {
    return <p className="font-mono text-[11px] text-muted">No requests in this range.</p>;
  }
  const parts = [
    { label: "You", value: totals.you, color: "var(--color-text)" },
    { label: "Other accounts", value: totals.others, color: "var(--color-info)" },
    { label: "Anonymous", value: totals.anonymous, color: "var(--color-muted)" },
  ];

  return (
    <>
      <Strip parts={parts} />
      {keys.length > 0 || handles.length > 0 ? (
        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <ActorList
            heading="you, by key"
            empty="No requests of your own in this range."
            rows={keys.map((k) => ({
              key: k.label + (k.revoked ? " (revoked)" : ""),
              label: (
                <>
                  {k.label}
                  {k.revoked ? <span className="pill ml-2 text-[10px]">revoked</span> : null}
                </>
              ),
              total: k.total,
              refused: k.refused,
              lastSeen: k.lastSeen,
            }))}
            now={now}
          />
          <ActorList
            heading="other accounts"
            empty="No other account in this range."
            rows={handles.map((h) => ({
              key: h.handle,
              label: h.handle,
              total: h.total,
              refused: h.refused,
              lastSeen: h.lastSeen,
            }))}
            now={now}
          />
        </div>
      ) : null}
      {handles.length >= ACTOR_ROW_LIMIT ? (
        <p className="mt-3 font-mono text-[11px] text-muted">
          The busiest {ACTOR_ROW_LIMIT} accounts are listed; the strip counts every one.
        </p>
      ) : null}
    </>
  );
}

/** One bar, segments in proportion, with a labelled legend beneath. */
function Strip({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1, parts.reduce((a, p) => a + p.value, 0));
  return (
    <div>
      <div
        className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.label}
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
            />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ background: p.color }}
              aria-hidden
            />
            {p.label}{" "}
            <span className="text-text tabular-nums">{p.value.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ActorListRow = {
  key: string;
  label: React.ReactNode;
  total: number;
  refused: number;
  lastSeen: Date;
};

/** One column of `label · n · m refused · last seen` rows under a mono heading. */
function ActorList({
  heading,
  empty,
  rows,
  now,
}: {
  heading: string;
  empty: string;
  rows: ActorListRow[];
  now: number;
}) {
  return (
    <div>
      <div className="mb-1 font-mono text-[11px] text-muted">{heading}</div>
      {rows.length === 0 ? (
        <p className="border-t border-border py-1.5 font-mono text-[11px] text-muted">{empty}</p>
      ) : (
        <ul className="font-mono text-[11px]">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center justify-between gap-3 border-t border-border py-1.5"
            >
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="shrink-0 tabular-nums">
                {r.total.toLocaleString("en-US")}{" "}
                <span className={r.refused > 0 ? "text-warn" : "text-muted"}>
                  · {r.refused.toLocaleString("en-US")} refused
                </span>{" "}
                <span className="text-muted">· {ago(r.lastSeen.getTime(), now)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
