"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/authClient";

// Signs the user out via Better Auth, then sends them to the landing page.
export function LogoutButton() {
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
      className="btn btn-secondary btn-sm"
      onClick={handleLogout}
      disabled={busy}
    >
      {busy ? "Signing out…" : "Log out"}
    </button>
  );
}
