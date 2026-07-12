import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LogoutButton } from "@/components/LogoutButton";
import { getServerSession } from "@/lib/betterAuth";

// Public marketing/docs shell. Reads the session server-side so the nav shows
// the right actions with no client-side flash.
export default async function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border bg-bg px-6 py-3.5">
        <Brand />
        <nav className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/docs" className="text-muted transition-colors hover:text-text">
            Docs
          </Link>
          <Link href="/pricing" className="text-muted transition-colors hover:text-text">
            Pricing
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className="btn btn-sm">
                Dashboard
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted transition-colors hover:text-text">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-sm">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
