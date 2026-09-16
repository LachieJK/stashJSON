import type { ReactNode } from "react";

// The dashboard's standard reading column for its card-based pages
// (`/dashboard`, `/workspaces/[id]`, `/account`). Auth is handled by the parent
// `(dashboard)` layout; this group exists only so `/usage` can opt out of the
// width without every page repeating the wrapper.
export default function NarrowLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
      {children}
    </main>
  );
}
