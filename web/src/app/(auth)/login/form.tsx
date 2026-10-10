"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

/** Only same-origin paths are accepted as a post-login destination (no open redirect). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/app";
}

export function LoginForm({ demo, next }: { demo: boolean; next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(demo ? "demo@kinetix.dev" : "");
  const [password, setPassword] = useState(demo ? "kinetix-demo-2026" : "");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function done() {
    router.push(safeNext(next));
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await call<{ mfa_required?: boolean; challenge?: string }>("POST", "/auth/login", {
        email,
        password,
      });
      if (r.mfa_required && r.challenge) {
        setChallenge(r.challenge);
        setPending(false);
        return;
      }
      done();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach KinetixZero. Try again.");
      setPending(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await call("POST", "/auth/mfa/verify", {
        challenge,
        ...(useRecovery ? { recovery_code: code } : { code }),
      });
      done();
    } catch (err) {
      if (err instanceof ApiError && err.code === "mfa_expired") {
        setChallenge(null);
        setCode("");
      }
      setError(err instanceof ApiError ? err.message : "Couldn't reach KinetixZero. Try again.");
      setPending(false);
    }
  }

  if (challenge) {
    return (
      <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
        <p className="text-muted">
          {useRecovery
            ? "Enter one of the recovery codes you saved when you turned on two-step verification. Each code works once."
            : "Enter the 6-digit code from your authenticator app."}
        </p>
        <Field label={useRecovery ? "Recovery code" : "Verification code"} htmlFor="code">
          <input
            id="code"
            autoFocus
            autoComplete="one-time-code"
            inputMode={useRecovery ? "text" : "numeric"}
            maxLength={useRecovery ? 11 : 6}
            value={code}
            onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, ""))}
            placeholder={useRecovery ? "abcde-fghjk" : "123456"}
            className={`${inputClass} mono h-10 text-base tracking-[0.2em]`}
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
        <Button
          type="submit"
          variant="primary"
          disabled={pending || (!useRecovery && code.length !== 6)}
          className="w-full"
        >
          {pending ? "Verifying…" : "Verify"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v);
            setCode("");
            setError(null);
          }}
          className="text-vg self-start text-[13px] hover:underline"
        >
          {useRecovery ? "Use your authenticator app instead" : "Use a recovery code"}
        </button>
      </form>
    );
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
      <Link href="/forgot-password" className="text-vg -mt-2 self-end text-[13px] hover:underline">
        Forgot password?
      </Link>
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
