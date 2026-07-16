import type { ReactNode } from "react";
import { DocsSidebar } from "./DocsSidebar";

// Docs shell: the API-reference sidebar on the left (sticky on desktop),
// content on the right. Stacks vertically on mobile, two columns from `md` up.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        <DocsSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
