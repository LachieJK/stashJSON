import type { ReactNode } from "react";

// Centered, chrome-light shell for login/signup. The global navbar (root
// layout) carries the brand; flex-1 centers the card in the remaining
// viewport height under it.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
