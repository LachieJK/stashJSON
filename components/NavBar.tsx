"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "./Brand";
import { LogoutButton } from "./LogoutButton";

// The one navbar, rendered on every route group by <SiteNav> (which reads the
// session server-side and passes auth state down). Every area of the product
// stays reachable from everywhere: Docs/Pricing always, Dashboard/Account when
// logged in, Log in/Sign up when logged out. Below `md` the links collapse
// into a disclosure menu hanging off the bar.
//
// Client component only for the interactive bits: the active-route marker
// (usePathname) and the mobile menu. Icons are Lucide, inlined as SVG.

type NavLink = {
  href: string;
  label: string;
  /** Path prefixes that count as "here" (defaults to the href itself). */
  match?: string[];
};

const EXPLORE: NavLink[] = [
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
];

const APP: NavLink[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    // Workspace detail pages are part of the dashboard area.
    match: ["/dashboard", "/workspaces"],
  },
  { href: "/account", label: "Account" },
];

function isActive(pathname: string, link: NavLink): boolean {
  const prefixes = link.match ?? [link.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function NavBar({
  authed,
  email,
}: {
  authed: boolean;
  email: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever navigation happens…
  useEffect(() => setOpen(false), [pathname]);

  // …and on Escape while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links = authed ? [...EXPLORE, ...APP] : EXPLORE;

  function current(link: NavLink) {
    return isActive(pathname, link) ? ("page" as const) : undefined;
  }

  return (
    <header className="navbar">
      <Brand />

      {/* Desktop: inline links, hairline divider, then the auth cluster. */}
      <nav
        className="ml-auto hidden items-center gap-5 md:flex"
        aria-label="Primary"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link"
            aria-current={current(link)}
          >
            {link.label}
          </Link>
        ))}
        <span className="h-4 w-px bg-border" aria-hidden />
        {authed ? (
          <>
            {email ? (
              <span className="hidden max-w-44 truncate font-mono text-xs text-muted lg:inline">
                {email}
              </span>
            ) : null}
            <LogoutButton />
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="nav-link"
              aria-current={current({ href: "/login", label: "Log in" })}
            >
              Log in
            </Link>
            <Link href="/signup" className="btn btn-sm">
              Sign up
            </Link>
          </>
        )}
      </nav>

      {/* Mobile: disclosure trigger + dropdown panel. */}
      <button
        type="button"
        className="nav-icon-btn ml-auto md:hidden"
        aria-expanded={open}
        aria-controls="site-nav-menu"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <XIcon /> : <MenuIcon />}
      </button>

      {open ? (
        <nav
          id="site-nav-menu"
          className="nav-menu md:hidden"
          aria-label="Primary"
        >
          <Link
            href="/"
            className="nav-menu-link"
            aria-current={pathname === "/" ? "page" : undefined}
          >
            Home
          </Link>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-menu-link"
              aria-current={current(link)}
            >
              {link.label}
            </Link>
          ))}
          <span className="my-1.5 border-t border-border" aria-hidden />
          {authed ? (
            <>
              {email ? (
                <span className="truncate px-3 pb-1.5 font-mono text-xs text-muted">
                  {email}
                </span>
              ) : null}
              <LogoutButton className="nav-menu-link" />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="nav-menu-link"
                aria-current={
                  pathname === "/login" ? ("page" as const) : undefined
                }
              >
                Log in
              </Link>
              <Link href="/signup" className="btn mt-1">
                Sign up
              </Link>
            </>
          )}
        </nav>
      ) : null}
    </header>
  );
}

// Lucide "menu"
function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
    </svg>
  );
}

// Lucide "x"
function XIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
