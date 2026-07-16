"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { METHOD_TEXT_COLORS } from "../_components";
import { DOC_GROUPS, endpointId } from "./nav";

/*
 * Docs sidebar — the API reference index.
 *
 * Collapsed by default to the six group tabs. Clicking a group navigates to
 * the top of its page (which also auto-expands it); the chevron alone toggles
 * the accordion without navigating. Subtabs pair a syntax-coloured verb with
 * the endpoint's simple heading and hang off a hairline tree rail; a
 * scroll-spy inverts the rail segment of the heading currently in view —
 * the sidebar always tells you where you are.
 */

// Lucide chevron-right, inlined per the brief (stroke inherits currentColor).
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function DocsSidebar() {
  const pathname = usePathname();
  // Explicit user toggles; the current route's group is open regardless.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  // Re-open the active group whenever the route changes (clearing any manual
  // collapse of it from a previous visit).
  useEffect(() => {
    setToggled((t) => (t[pathname] === false ? { ...t, [pathname]: true } : t));
  }, [pathname]);

  // Scroll-spy: watch the current page's endpoint headings and highlight the
  // one in the reading band near the top of the viewport.
  useEffect(() => {
    setActiveId(null);
    const group = DOC_GROUPS.find((g) => g.href === pathname);
    if (!group) return;

    const headings = group.items
      .map((item) => document.getElementById(endpointId(item.method, item.path)))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      // Band from just under the floating navbar to a third down the screen.
      { rootMargin: "-90px 0px -66% 0px" },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <nav aria-label="API reference" className="md:w-60 md:shrink-0">
      <div className="md:sticky md:top-24 md:max-h-[calc(100vh-7.5rem)] md:overflow-y-auto md:pb-4">
        <p className="eyebrow mb-2">API reference</p>

        <Link
          href="/docs"
          aria-current={pathname === "/docs" ? "page" : undefined}
          className={`flex min-h-10 items-center rounded-md px-2 text-sm font-medium transition-colors hover:text-text md:min-h-9 ${
            pathname === "/docs" ? "text-text" : "text-muted"
          }`}
        >
          Overview
        </Link>

        <ul>
          {DOC_GROUPS.map((group) => {
            const isCurrentPage = pathname === group.href;
            const isOpen = toggled[group.href] ?? isCurrentPage;
            return (
              <li key={group.href}>
                <div className="flex items-center">
                  <Link
                    href={group.href}
                    aria-current={isCurrentPage ? "page" : undefined}
                    onClick={() => {
                      // Re-clicking the current page's tab still returns you
                      // to the top (Next skips same-URL navigations).
                      if (isCurrentPage) window.scrollTo({ top: 0 });
                    }}
                    className={`flex min-h-10 flex-1 items-center rounded-md px-2 text-sm font-medium transition-colors hover:text-text md:min-h-9 ${
                      isCurrentPage ? "text-text" : "text-muted"
                    }`}
                  >
                    {group.label}
                  </Link>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.label}`}
                    onClick={() =>
                      setToggled((t) => ({ ...t, [group.href]: !isOpen }))
                    }
                    className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:text-text md:size-9"
                  >
                    <Chevron open={isOpen} />
                  </button>
                </div>

                {isOpen ? (
                  <ul className="mt-0.5 mb-1.5 ml-2 border-l border-border">
                    {group.items.map((item) => {
                      const id = endpointId(item.method, item.path);
                      const isActive = isCurrentPage && activeId === id;
                      return (
                        <li key={id}>
                          <Link
                            href={`${group.href}#${id}`}
                            aria-current={isActive ? "location" : undefined}
                            className={`-ml-px flex min-h-10 items-center gap-2 border-l py-1.5 pr-1 pl-3 leading-tight transition-colors md:min-h-8 md:py-1 ${
                              isActive
                                ? "border-text text-text"
                                : "border-transparent text-muted hover:border-muted hover:text-text"
                            }`}
                          >
                            <span
                              className={`w-12 shrink-0 font-mono text-[10px] font-semibold ${METHOD_TEXT_COLORS[item.method]}`}
                            >
                              {item.method}
                            </span>
                            <span className="text-[13px]">{item.title}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
