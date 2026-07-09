import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ApiKeyProvider } from "@/app/providers";

export const metadata: Metadata = {
  title: "StashJSON",
  description: "Simple JSON document storage",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ApiKeyProvider>
          <header className="site-header">
            <Link href="/" className="brand">
              Stash<span>JSON</span>
            </Link>
            <span className="badge">dashboard</span>
          </header>
          <main className="container">{children}</main>
        </ApiKeyProvider>
      </body>
    </html>
  );
}
