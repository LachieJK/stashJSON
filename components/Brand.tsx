import Link from "next/link";

// The wordmark, linking home. Shared across every header. Braces in the `ok`
// green are the one colour pop in the chrome — the same glyph as the favicon
// (app/icon.svg); the name itself stays in the page's text colour.
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="text-lg font-bold tracking-tight text-text no-underline"
    >
      <span className="font-mono text-ok" aria-hidden>
        {"{ "}
      </span>
      StashJSON
      <span className="font-mono text-ok" aria-hidden>
        {" }"}
      </span>
    </Link>
  );
}
