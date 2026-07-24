import Link from "next/link";
import { MethodBadge } from "./_components";
import { CopyLine } from "./_landing/CopyLine";
import { Frame, Mark, RailStreak } from "./_landing/primitives";
import { SectionBreak } from "./_landing/SectionBreak";
import { VersionScrubber } from "./_landing/VersionScrubber";

/*
 * Landing page — a wide framed schematic. Hairline rails bound a max-w-6xl
 * frame and run the height of the page; sections alternate between split and
 * single-column so the page reads as a grid rather than one long tube; and the
 * texture is structural throughout — + glyph break bands, a ticker strip, and
 * write streaks travelling the rails. Token colours only.
 *
 * Server-rendered except for the three interactive pieces under _landing/.
 */

const TICKER = [
  "schema enforcement",
  "automatic versioning",
  "workspaces",
  "rotatable api keys",
  "public + private reads",
  "shallow patch merges",
  "jsonb storage",
  "no database setup",
];

const STEPS = [
  {
    n: "01",
    title: "Grab a key",
    body: "Create an account and mint an API key from the dashboard — the only credential you need.",
    line: "X-API-Key: sk_live_••••3f2a",
  },
  {
    n: "02",
    title: "POST your JSON",
    method: "POST" as const,
    body: "Send any document, exactly as it is. You get an id back — it now lives in the stash.",
    line: "201 → { id: tm4xVd91LqPz8aQ3, version: 1 }",
  },
  {
    n: "03",
    title: "Update without fear",
    method: "PUT" as const,
    body: "Replace or patch it as it evolves. Every write snapshots the previous version first.",
    line: "200 → { id: tm4xVd91LqPz8aQ3, version: 2 }",
  },
];

const FEATURES: { title: string; body: string; frag: string }[] = [
  {
    title: "Schema enforcement",
    body: "Attach a JSON Schema to a workspace and every write is validated against it — including the merged result of a PATCH.",
    frag: `{ "type": "object", "required": ["title"] }`,
  },
  {
    title: "Automatic versioning",
    body: "Each update snapshots the previous document inside a transaction. Nothing is ever lost; v1 stays fetchable forever.",
    frag: "GET /api/documents/:id/versions/1",
  },
  {
    title: "Workspaces",
    body: "Organise documents into per-project collections, each with its own optional schema and its own scope.",
    frag: "workspaces/invoices · 128 docs",
  },
  {
    title: "Keys & web login",
    body: "Automate with rotatable API keys, or drive the whole service from the dashboard with an email login.",
    frag: "X-API-Key: sk_live_••••••3f2a",
  },
];

const USE_CASES: { title: string; body: string }[] = [
  {
    title: "Config & feature flags",
    body: "Ship config without a deploy. Fetch any earlier version and write it back.",
  },
  {
    title: "Form & webhook payloads",
    body: "Land arbitrary JSON now, shape it later. Nothing is dropped.",
  },
  {
    title: "Content & drafts",
    body: "Draft → review → published, with the full edit history for free.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need a database?",
    a: "No. StashJSON is the database. You authenticate with an API key and POST JSON — there is no schema migration, no connection string, no ORM.",
  },
  {
    q: "What happens to old versions?",
    a: "Every PUT and PATCH snapshots the previous document before writing. Old versions are read-only and fetchable by number, forever.",
  },
  {
    q: "Can I enforce a shape?",
    a: "Yes — attach a JSON Schema (Draft-07) to a workspace and every document written into it is validated on the way in.",
  },
  {
    q: "Is anything public by default?",
    a: "No. Documents are private to your account unless you explicitly mark them public, in which case they are readable without a key.",
  },
  {
    q: "How do I move off it?",
    a: "Your data is plain JSON. List your documents, GET each one, and you have a complete export — no proprietary format to unwind.",
  },
];

export default function LandingPage() {
  return (
    <div className="overflow-x-clip">
      {/* ── Hero — two columns split by an inner rail: copy left, the live
          scrubbable document right. */}
      <section>
        <Frame className="px-0">
          <RailStreak edge="left" delay="-3.1s" duration="9.1s" />
          <RailStreak edge="right" dir="rev" delay="-8.4s" duration="13.9s" />
          <div className="grid lg:grid-cols-[1.05fr_1fr]">
            <div className="px-8 pt-20 pb-14 sm:pt-24 lg:pb-20">
              <Mark>JSON document storage</Mark>
              <h1 className="mt-7 text-5xl leading-[0.95] font-extrabold tracking-tighter text-balance sm:text-6xl">
                Store fast.
                <br />
                Build faster.
              </h1>
              <p className="mt-6 max-w-lg leading-relaxed text-muted">
                A light-weight JSON backend for developers who want to ship.
                Store documents, organise them into workspaces, enforce schemas,
                and keep every change — no database setup, just a REST API that
                gets out of your way.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="btn">
                  Get started free
                </Link>
                <Link href="/docs" className="btn btn-secondary">
                  Read the docs
                </Link>
              </div>
              <CopyLine />
            </div>

            <div className="relative border-t border-border px-8 pt-10 pb-16 lg:border-t-0 lg:border-l">
              <Mark>Version history</Mark>
              <VersionScrubber />
            </div>
          </div>
        </Frame>
      </section>

      {/* ── Ticker — full-bleed, breaking the frame on purpose. The break band
          below supplies its lower rule, so it only owns its top one. */}
      <section className="border-y border-border py-4">
        <div className="ticker font-mono text-[11px] tracking-[0.25em] text-muted uppercase">
          <div className="ticker-track">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="px-8">
                {t} <span className="text-border">✳</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works — a heading over a full-width 3-up band of
          ghost-numeral steps, so the section reads as a single statement. */}
      <section>
        <Frame>
          <RailStreak edge="left" dir="rev" delay="-12.2s" duration="16.3s" />
          <RailStreak edge="right" delay="-5.7s" duration="11.3s" />
          <div className="px-8 pt-16 pb-2">
            <Mark>How it works</Mark>
            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              Seriously. That’s it.
            </h2>
            <p className="mt-4 max-w-md text-muted">
              Three calls from an empty account to a versioned document.
            </p>
          </div>
          <div className="mt-12 grid border-t border-border sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className={`p-8 ${
                  i > 0
                    ? "border-t border-border sm:border-t-0 sm:border-l"
                    : ""
                }`}
              >
                <span className="font-mono text-5xl font-bold text-border">
                  {s.n}
                </span>
                <h3 className="mt-5 flex flex-wrap items-center gap-2.5 font-semibold">
                  {s.title}
                  {s.method ? <MethodBadge method={s.method} /> : null}
                </h3>
                <p className="mt-2 text-sm text-muted">{s.body}</p>
                <p className="mt-6 font-mono text-[11px] break-all text-muted">
                  {s.line}
                </p>
              </div>
            ))}
          </div>
        </Frame>
      </section>

      {/* ── Features — a ruled list whose fragment resolves on hover, so the
          section stays typographic until touched. */}
      <SectionBreak />
      <section>
        <Frame>
          <RailStreak edge="right" dir="rev" delay="-1.9s" duration="10.3s" />
          {/* No top streak — the rule above belongs to the break band. */}
          <div className="grid lg:grid-cols-[280px_1fr]">
            <div className="px-8 pt-16 pb-8 lg:pb-16">
              <Mark>Features</Mark>
              <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                The good stuff.
              </h2>
            </div>
            <div className="border-border lg:border-l">
              {FEATURES.map(({ title, body, frag }) => (
                <div
                  key={title}
                  className="group border-t border-border px-8 py-7 transition-colors first:lg:border-t-0 hover:bg-panel"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-muted opacity-0 transition-opacity group-hover:opacity-100">
                      ▸
                    </span>
                    <h3 className="text-xl font-semibold tracking-tight">
                      {title}
                    </h3>
                  </div>
                  <div className="mt-2 flex flex-col gap-3 pl-8 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10">
                    <p className="max-w-xl text-sm text-muted">{body}</p>
                    <span className="shrink-0 font-mono text-[11px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                      {frag}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Frame>
      </section>

      {/* ── Built for — three plain cells; the texture lives in the + break
          bands either side, not behind the copy. */}
      <SectionBreak />
      <section>
        <Frame>
          {/* No top streak here — this section's top edge is the break band's
              border, not a frame rail. */}
          <RailStreak edge="right" delay="-2.6s" duration="11.9s" />
          <div className="px-8 pt-16">
            <Mark>Built for</Mark>
            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              Where it fits.
            </h2>
          </div>
          <div className="mt-12 grid border-t border-border sm:grid-cols-3">
            {USE_CASES.map(({ title, body }, i) => (
              <div
                key={title}
                className={`p-8 ${
                  i > 0
                    ? "border-t border-border sm:border-t-0 sm:border-l"
                    : ""
                }`}
              >
                <h3 className="font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm text-muted">{body}</p>
              </div>
            ))}
          </div>
        </Frame>
      </section>

      {/* ── FAQ — sticky label left, accordion right on the inner rail. */}
      <SectionBreak />
      <section>
        <Frame>
          <RailStreak edge="left" delay="-4.4s" duration="12.7s" />
          <div className="grid lg:grid-cols-[280px_1fr]">
            <div className="px-8 pt-16 pb-8 lg:sticky lg:top-20 lg:self-start lg:pb-16">
              <Mark>FAQ</Mark>
              <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                Questions.
              </h2>
              <p className="mt-4 text-sm text-muted">
                Everything else is in the{" "}
                <Link href="/docs" className="link">
                  docs
                </Link>
                .
              </p>
            </div>
            <div className="border-border lg:border-l">
              {FAQ.map(({ q, a }) => (
                <details
                  key={q}
                  className="group border-t border-border px-8 py-6 first:lg:border-t-0 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-6 font-semibold tracking-tight">
                    {q}
                    <span className="font-mono text-sm text-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </Frame>
      </section>

      {/* ── Closing. */}
      <SectionBreak />
      <section>
        <Frame>
          <RailStreak edge="left" dir="rev" delay="-9.3s" duration="13.1s" />
          <div className="px-8 py-24 text-center">
            <Mark>Get started</Mark>
            <h2 className="mt-6 text-4xl font-extrabold tracking-tighter sm:text-5xl">
              Start stashing.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              Free to start. Your first document is one POST away.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="btn">
                Get started free
              </Link>
              <Link href="/pricing" className="btn btn-secondary">
                See pricing
              </Link>
            </div>
            <p className="mt-6 font-mono text-[11px] text-muted">
              no card required
            </p>
          </div>
        </Frame>
      </section>
    </div>
  );
}
