import type { ReactNode } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/documents", label: "Documents" },
  { href: "/docs/workspaces", label: "Workspaces" },
];

// Docs shell: a left sidebar of section links, content on the right.
// Stacks vertically on mobile, two columns from `md` up.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-8 md:flex-row md:gap-10">
        <nav className="md:w-48 md:shrink-0">
          <div className="mb-3 text-[11px] uppercase tracking-wide text-muted">
            Documentation
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-md px-2 py-1.5 text-muted hover:bg-panel-2 hover:text-text"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
