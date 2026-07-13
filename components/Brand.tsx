import Link from "next/link";

// The wordmark, linking home. Shared across every header.
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="text-lg font-bold tracking-tight text-text no-underline"
    >
      Stash<span className="text-muted">JSON</span>
    </Link>
  );
}
