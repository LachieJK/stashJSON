import Link from "next/link";
import type { CSSProperties, InputHTMLAttributes } from "react";
import { Brand } from "@/components/Brand";

/*
 * Shared furniture for the full-viewport auth split. Everything here is
 * server-safe (no hooks): the layout renders the panel and the top-bar shell
 * on the server, while the client login/signup pages reuse AuthHeader/Field.
 * The interactive pieces live in their own "use client" files (AuthTopBar,
 * AuthError).
 */

// Lucide "arrow-left"
function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

/*
 * Top-left cluster of the form column: the way back, then a hairline divider,
 * then the wordmark — the same divider idiom the navbar uses between its links
 * and its auth actions, so the auth pages read as the same system even with
 * the bar gone.
 *
 * The back link leads the cluster because its arrow points at the page edge;
 * the label always names the destination, so it reads as an affordance rather
 * than a duplicate of the wordmark beside it.
 *
 * Rendered by <AuthTopBar>, which resolves the destination from the route.
 */
export function AuthTopBarShell({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Link href={backHref} className="auth-back">
        <ArrowLeftIcon />
        {backLabel}
      </Link>
      <span className="h-4 w-px bg-border" aria-hidden />
      <Brand />
    </div>
  );
}

export function AuthHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <>
      {/* A full viewport earns a decisive heading (brief: headings are heavy
       * and tight) — the old card's text-lg would float here. */}
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">{subtitle}</p>
    </>
  );
}

// A labelled input. Height is left to the global .input on purpose — raising
// the control floor to a 40px touch target is a separate, product-wide pass.
export function Field({
  id,
  label,
  hint,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/*
 * The ledger — the split's texture panel (desktop only).
 *
 * A version history hung off a hairline rail, newest first: the current
 * version stays at full contrast, superseded ones sit muted, and a streak
 * sweeps the rail lifting each one as it passes. It argues "nothing is ever
 * lost" by being a version history rather than by claiming anything.
 *
 * aria-hidden in full: it's ambient texture beside a form, and narrating a
 * fictional document's history to someone mid-signup is noise, not access.
 */
const LEDGER: { version: string; status: string; age: string }[] = [
  { version: "v4", status: "shipped", age: "just now" },
  { version: "v3", status: "in review", age: "2m ago" },
  { version: "v2", status: "draft", age: "1h ago" },
  { version: "v1", status: "created", age: "3h ago" },
];

export function AuthPanel() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden overflow-hidden border-l border-border bg-panel lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-20"
    >
      {/* The border-l seam does the work: panel #0a0a0a on #000 (and #fafafa
       * on #fff) is invisible without it — the split reads as a rail. */}
      <div className="w-full max-w-sm">
        <p className="eyebrow">Version history</p>
        <p className="mt-3 font-mono text-xs text-muted">
          documents/tm4xVd91LqPz8aQ3
        </p>

        <ol className="ledger-rail mt-8">
          <span className="ledger-sweep" />
          {LEDGER.map((row, i) => (
            <li
              key={row.version}
              // Row 0 is the current version — permanently lit, and the
              // resting state the reduced-motion guard leaves behind.
              className={`ledger-row ${i === 0 ? "text-text" : "ledger-row-flash"}`}
              style={{ "--row-delay": `${0.5 + i * 0.5}s` } as CSSProperties}
            >
              <span className="pill">{row.version}</span>
              {/* Inherits the row's colour, so it's what the sweep lifts. */}
              <span className="flex-1 font-mono text-xs">{row.status}</span>
              <span className="font-mono text-[11px] text-muted">
                {row.age}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-12 text-xl font-semibold tracking-tight">
          Nothing is ever lost.
        </p>
      </div>
    </aside>
  );
}
