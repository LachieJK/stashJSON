"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/authClient";

// Signs the user out via Better Auth, then sends them to the landing page.
// `className` lets contexts restyle it (e.g. as a row in the mobile nav menu).
export function LogoutButton({
  className = "btn btn-secondary btn-sm",
}: {
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      className={className}
      onClick={handleLogout}
      disabled={busy}
    >
      {busy ? "Signing out…" : "Log out"}
    </button>
  );
}
