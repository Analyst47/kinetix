"use client";

import { MailCheck } from "lucide-react";
import { useState } from "react";

import { Button, Field, FormAlert, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await call("POST", "/auth/password/forgot", { email });
      setSentTo(email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach KinetixZero. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="border-rule bg-raised flex flex-col gap-2 rounded-md border p-4">
        <p className="flex items-center gap-2 font-semibold">
          <MailCheck className="text-brand size-4" aria-hidden />
          Check your email
        </p>
        <p className="text-muted text-[13px]">
          If an account uses <span className="text-ink font-medium">{sentTo}</span>, a reset link is on its
          way. It works once and expires in 30 minutes. Nothing there? Check spam, or make sure this is the
          address you signed up with.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="text-brand self-start text-[13px] hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="primary" disabled={pending || !email.includes("@")} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
