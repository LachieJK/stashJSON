import Link from "next/link";

// Landing page. Deliberately simple — the product is a developer tool.
export default function LandingPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          JSON storage that just works
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          Store arbitrary JSON documents, organize them into workspaces, enforce
          a schema per workspace, and get automatic version history on every
          update — all behind a simple REST API.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn">
            Get started free
          </Link>
          <Link href="/docs" className="btn btn-secondary">
            Read the docs
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Schema enforcement",
            body: "Attach a JSON Schema to a workspace; every document is validated on write.",
          },
          {
            title: "Automatic versioning",
            body: "Every update snapshots the previous document, so nothing is ever lost.",
          },
          {
            title: "API keys & web login",
            body: "Manage the service from the dashboard, or automate it with rotatable API keys.",
          },
        ].map((f) => (
          <div key={f.title} className="card">
            <h2 className="text-base font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
