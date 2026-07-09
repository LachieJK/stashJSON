"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/authClient";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get("plan");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signUp.email({ email, password, name });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Could not create your account.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="card">
      <h1 className="text-lg font-semibold">Create your account</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        {plan
          ? `You picked the ${plan.toUpperCase()} plan — create an account to continue.`
          : "Start storing JSON in seconds."}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            className="input"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>
        {error && <p className="notice notice-error">{error}</p>}
        <button className="btn mt-1" type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent">
          Log in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="card text-sm text-muted">Loading…</div>}>
      <SignupForm />
    </Suspense>
  );
}
