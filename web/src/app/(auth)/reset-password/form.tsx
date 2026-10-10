"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, ButtonLink, Field, FormAlert, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

const MIN_LENGTH = 12;

type State =
  | { kind: "checking" }
  | { kind: "invalid" }
  | { kind: "ready"; token: string; mfaRequired: boolean; emailHint: string }
  | { kind: "done" };

export function ResetForm() {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    // Drop the token from the address bar and history as soon as it's read.
    window.history.replaceState(null, "", window.location.pathname);
    const check = token
      ? call<{ valid: boolean; mfa_required: boolean; email_hint: string | null }>(
          "POST",
          "/auth/password/reset/check",
          { token },
        )
      : Promise.resolve(null);
    check
      .then((r) =>
        setState(
          r?.valid && token
            ? { kind: "ready", token, mfaRequired: r.mfa_required, emailHint: r.email_hint ?? "" }
            : { kind: "invalid" },
        ),
      )
      .catch(() => setState({ kind: "invalid" }));
  }, []);

  if (state.kind === "checking") {
    return <p className="text-muted">Checking your link…</p>;
  }

  if (state.kind === "invalid") {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert>This reset link is invalid or has expired. Links work once, for 30 minutes.</FormAlert>
        <ButtonLink href="/forgot-password" variant="primary" className="w-full">
          Get a new link
        </ButtonLink>
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 font-semibold">
          <CircleCheck className="text-ok size-4" aria-hidden />
          Password changed
        </p>
        <p className="text-muted text-[13px]">Sign in with your new password.</p>
        <ButtonLink href="/login" variant="primary" className="w-full">
          Sign in
        </ButtonLink>
      </div>
    );
  }

  const { token, mfaRequired, emailHint } = state;
  const mismatch = confirm.length > 0 && confirm !== password;
  const codeOk = !mfaRequired || (useRecovery ? code.length >= 10 : code.length === 6);
  const canSubmit = password.length >= MIN_LENGTH && confirm === password && codeOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await call("POST", "/auth/password/reset", {
        token,
        password,
        ...(mfaRequired ? (useRecovery ? { recovery_code: code } : { code }) : {}),
      });
      setState({ kind: "done" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "reset_invalid") {
        setState({ kind: "invalid" });
        return;
      }
      setError(err instanceof ApiError ? err.message : "Couldn't reach KinetixZero. Try again.");
      setCode("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-muted text-[13px]">
        For <span className="text-ink mono">{emailHint}</span>
      </p>
      <Field label="New password" htmlFor="password" hint={`At least ${MIN_LENGTH} characters.`}>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="confirm"
        error={mismatch ? "Passwords don't match." : null}
      >
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </Field>
      {mfaRequired ? (
        <div className="border-rule flex flex-col gap-2 border-t pt-4">
          <Field
            label={useRecovery ? "Recovery code" : "Code from your authenticator app"}
            htmlFor="code"
            hint="Two-step verification is on for this account, so a reset needs it too."
          >
            <input
              id="code"
              autoComplete="one-time-code"
              inputMode={useRecovery ? "text" : "numeric"}
              maxLength={useRecovery ? 11 : 6}
              value={code}
              onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, ""))}
              placeholder={useRecovery ? "abcde-fghjk" : "123456"}
              className={`${inputClass} mono tracking-[0.2em]`}
            />
          </Field>
          <button
            type="button"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode("");
            }}
            className="text-brand self-start text-[13px] hover:underline"
          >
            {useRecovery ? "Use your authenticator app instead" : "Use a recovery code"}
          </button>
        </div>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="primary" disabled={pending || !canSubmit} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
      <p className="text-muted text-[13px]">
        <Link
          href="/login"
          className="text-ink decoration-rule-strong hover:decoration-ink underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
