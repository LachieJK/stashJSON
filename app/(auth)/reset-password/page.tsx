"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/authClient";
import { AuthHeader, Field } from "../_components";
import { AuthError } from "../AuthError";

const TITLE = "Choose a new password";

/*
 * The emailed link goes through Better Auth first
 * (/api/auth/reset-password/<token>), which redirects here with `?token=` when
 * the link is live and `?error=INVALID_TOKEN` when it has expired or been
 * used. A token can also die between page load and submit (a second tab got
 * there first), so the same dead-link screen covers the submit-time refusal.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [linkDead, setLinkDead] = useState(
    params.get("error") === "INVALID_TOKEN" || !token,
  );

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    const res = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (res.error) {
      if (res.error.code === "INVALID_TOKEN") {
        setLinkDead(true);
      } else {
        setError(res.error.message ?? "Could not update your password.");
      }
      return;
    }
    // Every session was revoked, so the only way on is a fresh log-in.
    router.push("/login?reset=1");
  }

  if (linkDead) {
    return (
      <>
        <AuthHeader
          title="Link expired"
          subtitle="This link has expired or was already used."
        />
        <p className="mt-8 text-center text-sm text-muted">
          <Link href="/forgot-password" className="link">
            Request a new one
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        title={TITLE}
        subtitle="You'll log in with it everywhere from now on."
      />

      <form
        onSubmit={submit}
        aria-busy={busy}
        className="mt-8 flex flex-col gap-4"
      >
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <AuthError message={error} /> : null}
        <button className="btn mt-1 min-h-11" type="submit" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  // The fallback mirrors the real form's opening block, so the Suspense swap
  // doesn't jump the column's centred content.
  return (
    <Suspense fallback={<AuthHeader title={TITLE} subtitle="Loading…" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
