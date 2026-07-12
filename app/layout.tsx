import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

// Self-hosted via next/font — no external <link> tags. The CSS variables are
// wired into the Tailwind @theme font tokens in globals.css.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "StashJSON",
  description: "Simple JSON document storage for developers",
};

// Thin root shell. Each route group — (marketing), (auth), (dashboard) — brings
// its own header/nav via a nested layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
