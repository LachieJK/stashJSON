import type { ReactNode } from "react";
import { SiteNav } from "@/components/SiteNav";

// Public marketing/docs shell: the navbar plus the content landmark.
// The bar is mounted per route group (not in the root layout) so the (auth)
// group can be full-viewport with no chrome.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main>{children}</main>
    </>
  );
}
