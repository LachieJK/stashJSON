"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/authClient";
import { AuthHeader, Field } from "../_components";
import { AuthError } from "../AuthError";

/*
 * Landing page of the emailed reset link. Better Auth's link endpoint checks
 * the token first and redirects here with either `?token=…` or, for an expired
 * or spent link, `?error=INVALID_TOKEN`.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The link can also expire between landing here and submitting.
  const [expired, setExpired] = useState(
    params.get("error") === "INVALID_TOKEN" || !token,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    const res = await resetPassword({ newPassword: password, token });
    setBusy(false);
    if (res.error) {
      if (res.error.code === "INVALID_TOKEN") {
        setExpired(true);
        return;
      }
      setError(res.error.message ?? "Could not reset your password.");
      return;
    }
    router.push("/login?reset=1");
  }

  if (expired) {
    return (
      <>
        <AuthHeader
          title="Reset your password"
          subtitle="This link has expired or was already used."
        />
        <p className="mt-8 text-sm">
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
        title="Set a new password"
        subtitle="Saving it signs you out on every device."
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
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  // The fallback mirrors the real form's opening block, so the Suspense swap
  // doesn't jump the column's centred content.
  return (
    <Suspense
      fallback={<AuthHeader title="Set a new password" subtitle="Loading…" />}
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
