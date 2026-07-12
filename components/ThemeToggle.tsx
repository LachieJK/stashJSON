"use client";

// Floating light/dark toggle (bottom-right, circular — styled by .theme-toggle
// in globals.css). The page defaults to the browser's prefers-color-scheme; an
// explicit choice is applied as data-theme on <html> and persisted in
// localStorage (restored pre-paint by the inline script in app/layout.tsx).
// Toggling back to the system's own preference clears the override, so the
// page resumes following the browser setting live.
//
// Icons are Lucide (lucide.dev, ISC) inlined as SVG — stroke-based and
// minimalist per the design brief's iconography section; no npm dependency.
// Which icon shows is pure CSS (.theme-toggle-sun / .theme-toggle-moon), so
// the button is correct on first paint with no hydration mismatch.

const THEME_KEY = "theme";

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const explicit = root.dataset.theme;
    const current =
      explicit === "light" || explicit === "dark" ? explicit : systemTheme();
    const next = current === "light" ? "dark" : "light";

    if (next === systemTheme()) {
      // Back in line with the browser setting — drop the override entirely.
      delete root.dataset.theme;
      try {
        localStorage.removeItem(THEME_KEY);
      } catch {
        /* storage unavailable (private mode etc.) — theme still applies */
      }
    } else {
      root.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* storage unavailable — theme applies for this page view only */
      }
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Toggle light or dark theme"
      onClick={toggle}
    >
      <SunIcon className="theme-toggle-sun" />
      <MoonIcon className="theme-toggle-moon" />
    </button>
  );
}

// Lucide "sun"
function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

// Lucide "moon"
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
