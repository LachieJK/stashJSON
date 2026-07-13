import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { LogoutButton } from "@/components/LogoutButton";
import { getServerSession } from "@/lib/betterAuth";

// Authoritative session guard for the whole dashboard. Middleware does a fast
// cookie-presence redirect; this is the real check (it can reach the database).
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border bg-bg px-6 py-3.5">
        <Brand href="/dashboard" />
        <span className="pill">dashboard</span>
        <nav className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-muted transition-colors hover:text-text">
            Workspaces
          </Link>
          <Link href="/account" className="text-muted transition-colors hover:text-text">
            Account
          </Link>
          <span className="hidden text-muted sm:inline">
            {session.user.email}
          </span>
          <LogoutButton />
        </nav>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
        {children}
      </main>
    </>
  );
}
