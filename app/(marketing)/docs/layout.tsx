import type { ReactNode } from "react";
import { DocsSidebar } from "./DocsSidebar";
import { LangProvider } from "./LangProvider";

// Applies a remembered snippet language before first paint, so a Python reader
// never sees a frame of JavaScript. Mirrors the theme script in app/layout.tsx.
// JavaScript is the default and needs no attribute.
const langInitScript = `try{var l=localStorage.getItem("docs-lang");if(l==="python"||l==="java")document.documentElement.dataset.lang=l}catch(e){}`;

// Docs shell: the API-reference sidebar on the left (sticky on desktop),
// content on the right. Stacks vertically on mobile, two columns from `md` up.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <script dangerouslySetInnerHTML={{ __html: langInitScript }} />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          <DocsSidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </LangProvider>
  );
}
