import { Suspense } from "react";
import type { ReactNode } from "react";
import { AuthPanel, AuthTopBarShell } from "./_components";
import { AuthTopBar } from "./AuthTopBar";

/*
 * Full-viewport auth shell — no navbar, no footer (see app/layout.tsx).
 *
 * ≥lg: a half/half split. The form column is on the left so it leads the tab
 * order; the ledger panel is on the right. The grid is exactly h-dvh with
 * overflow hidden, so the PAGE never scrolls — a short laptop viewport scrolls
 * the form column instead, which is the house rule for content that outgrows
 * its box.
 *
 * <lg: one column, panel dropped entirely (it would be dead vertical weight
 * on a phone). The texture survives as hairline rails + ticks hugging the form
 * column — the landing page's frame idiom, so mobile still reads as the same
 * system. pb-0 lets those rails bleed off the bottom edge rather than stopping
 * short. dvh, not vh: mobile browser chrome would crop a vh page.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip lg:grid lg:h-dvh lg:grid-cols-2 lg:overflow-hidden">
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pt-8 pb-0 sm:px-8 lg:px-10 lg:pb-8">
        {/* Shares the form column's measure and padding, so the back link and
         * the wordmark sit on the same left edge as the heading below them. */}
        <div className="mx-auto w-full max-w-sm px-6 lg:px-0">
          <Suspense
            fallback={<AuthTopBarShell backHref="/" backLabel="Back to home" />}
          >
            <AuthTopBar />
          </Suspense>
        </div>

        {/* The rails run the column's full height and bleed off the bottom;
         * ticks mark the top intersection, as on the landing page. */}
        <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col border-x border-border px-6 lg:border-x-0 lg:px-0">
          <span className="tick tick-tl lg:hidden" aria-hidden />
          <span className="tick tick-tr lg:hidden" aria-hidden />

          {/* my-auto, not justify-center: centring a flex child that can
           * overflow its scroll container clips the top of it. */}
          <div className="my-auto py-10">{children}</div>
        </div>
      </main>

      <AuthPanel />
    </div>
  );
}
