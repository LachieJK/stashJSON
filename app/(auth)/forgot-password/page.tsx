"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/authClient";
import { AuthHeader, Field } from "../_components";
import { AuthError } from "../AuthError";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setBusy(false);
    if (res.error) {
      setError(
        res.error.status === 429
          ? "Too many reset requests — try again in a few minutes."
          : (res.error.message ?? "Could not send a reset link."),
      );
      return;
    }
    setSentTo(email);
  }

  return (
    <>
      <AuthHeader
        title="Reset your password"
        subtitle="We'll email you a link to set a new one."
      />

      {/* Same copy whether or not the address has an account: the page must
       * not reveal who is registered. */}
      {sentTo ? (
        <div className="mt-8 flex flex-col gap-4">
          <p role="status" className="notice notice-success">
            If an account exists for {sentTo}, a reset link is on its way. It
            expires in one hour.
          </p>
          <Link href="/login" className="link self-start text-sm">
            Back to log in
          </Link>
        </div>
      ) : (
        <>
          <form
            onSubmit={submit}
            aria-busy={busy}
            className="mt-8 flex flex-col gap-4"
          >
            <Field
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error ? <AuthError message={error} /> : null}
            <button className="btn mt-1 min-h-11" type="submit" disabled={busy}>
              {busy ? "Sending link…" : "Send reset link"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-muted">
            Remembered it?{" "}
            <Link href="/login" className="link">
              Log in
            </Link>
          </p>
        </>
      )}
    </>
  );
}
