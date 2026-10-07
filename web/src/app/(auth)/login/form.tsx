"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(demo ? "demo@kinetix.dev" : "");
  const [password, setPassword] = useState(demo ? "kinetix-demo-2026" : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await call("POST", "/auth/login", { email, password });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach Kinetix. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      {error ? (
        <p
          role="alert"
          className="border-crit/40 bg-crit-soft text-crit rounded-sm border px-3 py-2 text-[13px]"
        >
          {error}
        </p>
      ) : null}
      {demo ? <p className="text-muted text-xs">Demo workspace credentials are filled in.</p> : null}
      <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
