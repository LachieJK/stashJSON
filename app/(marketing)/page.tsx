import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { LivingDocument, MethodBadge, type Method } from "./_components";

/*
 * Landing page — a "framed schematic": the content column is bounded by
 * hairline rails that run the full page, sections are separated by full-bleed
 * rules with + ticks at the intersections, and texture comes from structure
 * (hatched bands, mono eyebrows) rather than colour or ornament. The two loud
 * moments — the living-document hero and the inverted closing band — bookend
 * an otherwise quiet monochrome page.
 */

const STEPS: {
  title: string;
  method?: Method;
  body: ReactNode;
  code?: string;
  response?: string;
}[] = [
  {
    title: "Grab a key",
    body: (
      <>
        <Link href="/signup" className="link">
          Create an account
        </Link>{" "}
        and mint an API key from your dashboard — the only credential you need.
      </>
    ),
  },
  {
    title: "POST your JSON",
    method: "POST",
    body: "Send any JSON document, exactly as it is. You get back an id — it now lives in the stash.",
    code: `curl -X POST https://api.stashjson.com/api/documents \\
  -H "X-API-Key: <your key>" \\
  -d '{"json_data": {"title": "Ship the launch post", "status": "draft"}}'`,
    response: `→ { "id": "tm4xVd91LqPz8aQ3", "version": 1 }`,
  },
  {
    title: "Update without fear",
    method: "PUT",
    body: "Replace or patch it as it evolves. Every write snapshots the previous version first — v1 stays fetchable forever.",
    code: `curl -X PUT https://api.stashjson.com/api/documents/tm4xVd91LqPz8aQ3 \\
  -H "X-API-Key: <your key>" \\
  -d '{"json_data": {"title": "Ship the launch post", "status": "shipped"}}'`,
    response: `→ { "id": "tm4xVd91LqPz8aQ3", "version": 2 }`,
  },
];

const FEATURES: { title: string; body: string; detail: ReactNode }[] = [
  {
    title: "Schema enforcement",
    body: "Attach a JSON Schema to a workspace; every document is validated on write.",
    detail: (
      <>
        <span className="text-muted">{`{ "type": "object" }`}</span>
        <span className="text-ok opacity-0 transition-opacity group-hover:opacity-100">
          ✓ valid
        </span>
      </>
    ),
  },
  {
    title: "Automatic versioning",
    body: "Every update snapshots the previous document, so nothing is ever lost.",
    detail: (
      <span className="flex items-center gap-1.5">
        <span className="pill">v3</span>
        <span className="pill">v2</span>
        <span className="pill">v1</span>
      </span>
    ),
  },
  {
    title: "Workspaces",
    body: "Organize documents into per-project collections, each with its own optional schema.",
    detail: <span className="text-muted">workspaces/invoices · 128 docs</span>,
  },
  {
    title: "API keys & web login",
    body: "Manage the service from the dashboard, or automate it with rotatable API keys.",
    detail: <span className="text-muted">X-API-Key: sk_••••••••••3f2a</span>,
  },
];

// A + tick pair for a section's top rail/rule intersections.
function Ticks() {
  return (
    <>
      <span className="tick tick-tl" aria-hidden />
      <span className="tick tick-tr" aria-hidden />
    </>
  );
}

// A write pulse on one of the section's rails. Negative delays start each
// streak mid-flight, so the page loads with the rails already alive and the
// pulses never sync up.
function RailPulse({
  side,
  delay,
  duration,
}: {
  side: "left" | "right";
  delay: string;
  duration: string;
}) {
  return (
    <span
      className={side === "left" ? "rail-pulse" : "rail-pulse rail-pulse-r"}
      style={
        {
          "--pulse-delay": delay,
          "--pulse-duration": duration,
        } as CSSProperties
      }
      aria-hidden
    />
  );
}

export default function LandingPage() {
  return (
    // pt-6 breathes between the floating navbar and the frame's top ticks.
    <div className="overflow-x-clip pt-6">
      {/* Hero — headline plus the living document. */}
      <section>
        <div className="frame-col px-6 pt-24 pb-20 text-center sm:pt-32">
          <Ticks />
          <RailPulse side="left" delay="-2s" duration="6.5s" />
          <RailPulse side="right" delay="-5.5s" duration="8s" />
          <h1 className="text-5xl font-extrabold tracking-tighter text-balance sm:text-7xl">
            Store Fast. <br className="mb-3"></br> Build Faster.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Built for developers who want to ship faster. We are a light-weight JSON
            backend that lets you store documents, organise them into workspaces,
            enforce schemas, and track every change automatically. No database setup,
            just a simple REST API that gets out of your way.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn">
              Get started free
            </Link>
            <Link href="/docs" className="btn btn-secondary">
              Read the docs
            </Link>
          </div>
          <LivingDocument />
        </div>
      </section>

      {/* How it works — a real sequence, so the steps are numbered and hung
       * off a local rail that echoes the page frame. */}
      <section className="section-rule">
        <div className="frame-col px-6 py-20">
          <Ticks />
          <RailPulse side="left" delay="-4s" duration="7.5s" />
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Seriously. That’s it.
          </h2>
          <ol className="relative mt-12 flex max-w-2xl flex-col gap-10">
            <span
              className="absolute top-2 bottom-2 left-[13px] w-px bg-border"
              aria-hidden
            />
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative flex gap-5">
                <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-bg font-mono text-xs text-muted">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3 className="flex flex-wrap items-center gap-2.5 font-semibold">
                    {step.title}
                    {step.method ? <MethodBadge method={step.method} /> : null}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted">{step.body}</p>
                  {step.code ? (
                    <pre className="codeblock mt-3">
                      <code>{step.code}</code>
                    </pre>
                  ) : null}
                  {step.response ? (
                    <p className="mt-2 font-mono text-xs text-muted">
                      {step.response}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features — one ruled 2×2 panel (shared hairline borders, not gapped
       * cards); each cell closes with a data-shaped mono fragment instead of
       * an icon. */}
      <section className="section-rule">
        <div className="frame-col">
          <Ticks />
          <RailPulse side="right" delay="-1s" duration="7s" />
          <div className="px-6 pt-20">
            <p className="eyebrow">Features</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              The Good Stuff.
            </h2>
          </div>
          <div className="mt-12 grid border-t border-border sm:grid-cols-2">
            {FEATURES.map((feature, i) => (
              <div
                key={feature.title}
                className={`group p-6 transition-colors hover:bg-panel sm:p-8 ${
                  [
                    "",
                    "border-t border-border sm:border-t-0 sm:border-l",
                    "border-t border-border",
                    "border-t border-border sm:border-l",
                  ][i]
                }`}
              >
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted">{feature.body}</p>
                <div className="mt-5 flex items-center gap-3 font-mono text-[11px]">
                  {feature.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA — same framed treatment as every other section; bold
       * through type and whitespace, not inversion. */}
      <section className="section-rule">
        <div className="frame-col px-6 py-24 text-center">
          <Ticks />
          <h2 className="text-4xl font-extrabold tracking-tighter sm:text-5xl">
            Start Stashing.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted">
            Free to start. Your first document is one POST away.
          </p>
          <Link href="/signup" className="btn mt-8">
            Get started free
          </Link>
        </div>
      </section>
    </div>
  );
}
