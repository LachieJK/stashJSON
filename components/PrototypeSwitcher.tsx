"use client";

/*
 * PROTOTYPE ONLY — delete with the usage-page variants.
 *
 * Floating variant switcher: ← / label / →, cycling the `?variant=` search
 * param (and the arrow keys). Deliberately styled unlike the rest of the site
 * so it never reads as part of the design being judged. Never rendered in a
 * production build.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function PrototypeSwitcher({
  variants,
  current,
  names,
}: {
  variants: string[];
  current: string;
  names: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (step: number) => {
    const i = variants.indexOf(current);
    const next = variants[(i + step + variants.length) % variants.length];
    const q = new URLSearchParams(params.toString());
    q.set("variant", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#666] bg-[#111] px-1.5 py-1.5 font-mono text-xs text-white shadow-lg shadow-black/40">
      <button
        onClick={() => go(-1)}
        className="cursor-pointer rounded-full px-2.5 py-1 hover:bg-white/15"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="min-w-[16rem] px-2 text-center tracking-wide whitespace-nowrap">
        {current} — {names[current] ?? "?"}
      </span>
      <button
        onClick={() => go(1)}
        className="cursor-pointer rounded-full px-2.5 py-1 hover:bg-white/15"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
}
