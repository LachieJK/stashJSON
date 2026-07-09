import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "StashJSON",
  description: "Simple JSON document storage for developers",
};

// Thin root shell. Each route group — (marketing), (auth), (dashboard) — brings
// its own header/nav via a nested layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
