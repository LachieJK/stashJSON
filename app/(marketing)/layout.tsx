import type { ReactNode } from "react";

// Public marketing/docs shell. Navigation is global now (SiteNav in the root
// layout), so this only provides the content landmark.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}
