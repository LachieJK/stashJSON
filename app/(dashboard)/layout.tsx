import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/betterAuth";
import { SiteNav } from "@/components/SiteNav";

// Authoritative session guard for the whole dashboard. Middleware does a fast
// cookie-presence redirect; this is the real check (it can reach the database).
// The navbar is mounted here (and in the marketing layout) rather than in the
// root layout, so the full-viewport (auth) pages can render without it; it
// shows the Dashboard/Usage/Account links and logout for signed-in users.
//
// Width is left to the nested groups: `(narrow)` wraps the card pages in the
// dashboard's `max-w-3xl` column, while `/usage` renders the landing page's
// wider framed report column and sets its own.
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <>
      <SiteNav />
      {children}
    </>
  );
}
