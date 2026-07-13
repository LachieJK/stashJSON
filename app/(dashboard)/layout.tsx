import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/betterAuth";

// Authoritative session guard for the whole dashboard. Middleware does a fast
// cookie-presence redirect; this is the real check (it can reach the database).
// Navigation lives in the global SiteNav (root layout), which shows the
// Dashboard/Account links and logout for signed-in users.
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
      {children}
    </main>
  );
}
