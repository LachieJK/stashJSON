"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/authClient";
import { AuthHeader, Field } from "../_components";
import { AuthError } from "../AuthError";

const TITLE = "Log in";
const SUBTITLE = "Welcome back to StashJSON.";

function LoginForm() {
  const router = useRouter();
  // /reset-password lands here with ?reset=1 once the new password is set —
  // every session was revoked, so this is a fresh log-in, not a return.
  const justReset = useSearchParams().get("reset") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Invalid email or password.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <AuthHeader title={TITLE} subtitle={SUBTITLE} />

      <form
        onSubmit={submit}
        aria-busy={busy}
        className="mt-8 flex flex-col gap-4"
      >
        {justReset ? (
          <p role="status" className="notice notice-success">
            Password updated — log in with your new password.
          </p>
        ) : null}
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          aside={
            <Link href="/forgot-password" className="link">
              Forgot?
            </Link>
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <AuthError message={error} /> : null}
        <button className="btn mt-1 min-h-11" type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        No account?{" "}
        <Link href="/signup" className="link">
          Sign up
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  // The fallback mirrors the real form's opening block, so the Suspense swap
  // doesn't jump the column's centred content.
  return (
    <Suspense fallback={<AuthHeader title={TITLE} subtitle={SUBTITLE} />}>
      <LoginForm />
    </Suspense>
  );
}
