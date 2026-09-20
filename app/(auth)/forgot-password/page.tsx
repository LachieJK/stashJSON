"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/authClient";
import { AuthHeader, Field } from "../_components";
import { AuthError } from "../AuthError";

/*
 * Request a reset link (CONTEXT.md: *Web sign-in → Reset link*). The success
 * copy is the same whether or not the address has an account — Better Auth
 * answers both identically and this page keeps it that way, so the form can't
 * be used to find out who has signed up.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.requestPasswordReset({
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

  if (sentTo) {
    return (
      <>
        <AuthHeader title="Check your email" subtitle="A link is on its way." />
        <p role="status" className="mt-8 text-sm text-muted">
          If an account exists for{" "}
          <span className="font-medium text-text">{sentTo}</span>, a reset link
          is on its way. It expires in one hour.
        </p>
        <p className="mt-8 text-center text-sm text-muted">
          <Link href="/login" className="link">
            Back to log in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        title="Reset your password"
        subtitle="Enter your email and we'll send you a reset link."
      />

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
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="link">
          Log in
        </Link>
      </p>
    </>
  );
}
