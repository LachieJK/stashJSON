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

// Root shell: fonts, the theme script, and the floating theme toggle — the
// chrome every page shares without exception.
//
// The navbar is NOT mounted here: <SiteNav> belongs to the (marketing) and
// (dashboard) layouts. The (auth) group deliberately has no nav — /login and
// /signup are full-viewport pages that carry their own brand and back link —
// so mounting the bar per-group makes "auth has no chrome" a structural fact
// and spares those two routes SiteNav's session lookup.
//
// The body is a min-height flex column so each group's shell can fill the
// viewport. suppressHydrationWarning: the theme script may set data-theme on
// <html> before React hydrates.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
