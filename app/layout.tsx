import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";

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

// Restores an explicit theme choice before first paint (no flash). No stored
// value means "follow the browser's prefers-color-scheme" — the default.
const themeInitScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

// Thin root shell. Each route group — (marketing), (auth), (dashboard) — brings
// its own header/nav via a nested layout. suppressHydrationWarning: the theme
// script may set data-theme on <html> before React hydrates.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
