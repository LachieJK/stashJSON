import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";

// Centered, chrome-light shell for login/signup.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="mb-8">
        <Brand />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
