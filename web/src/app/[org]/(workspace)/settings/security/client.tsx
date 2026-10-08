"use client";

import { Check, Copy, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";

import { Dialog } from "@/components/dialog";
import { Button, Field, FormAlert, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

type Step = "password" | "scan" | "codes";

export function MfaControls({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "enable" | "disable" | "regenerate">(null);
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  function reset() {
    setOpen(null);
    setStep("password");
    setPassword("");
    setCode("");
    setSecret(null);
    setQr(null);
    setCodes(null);
    setError(null);
    setCopied(false);
    router.refresh();
  }

  async function run(fn: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  const codesBlock = codes ? (
    <div className="flex flex-col gap-3">
      <p className="text-[13px]">
        Save these somewhere safe, like a password manager. Each one signs you in once if you lose your
        authenticator. They won&apos;t be shown again.
      </p>
      <ol className="bg-sunken mono grid grid-cols-2 gap-x-6 gap-y-1 rounded-md p-4">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <a
          className="border-rule-strong bg-raised hover:bg-paper inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium [&_svg]:size-4"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Kinetix recovery codes\n\n${codes.join("\n")}\n`)}`}
          download="kinetix-recovery-codes.txt"
        >
          <Download aria-hidden />
          Download
        </a>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-wrap gap-2">
      {enabled ? (
        <>
          <Button onClick={() => setOpen("regenerate")}>New recovery codes</Button>
          <Button variant="danger" onClick={() => setOpen("disable")}>
            Turn off
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={() => setOpen("enable")}>
          Turn on two-step verification
        </Button>
      )}

      <Dialog
        open={open === "enable"}
        onClose={reset}
        title="Turn on two-step verification"
        description={
          step === "password"
            ? "Confirm your password to continue."
            : step === "scan"
              ? "Scan the code with your authenticator app, then enter the 6-digit code it shows."
              : "Two-step verification is on."
        }
        footer={
          step === "codes" ? (
            <Button variant="primary" onClick={reset}>
              I saved my codes
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={reset}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="mfa-form" disabled={pending}>
                {step === "password" ? "Continue" : "Turn on"}
              </Button>
            </>
          )
        }
      >
        {step === "codes" ? (
          codesBlock
        ) : (
          <form
            id="mfa-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === "password") {
                void run(async () => {
                  const r = await call<{ secret: string; otpauth_uri: string }>("POST", "/auth/mfa/setup", {
                    password,
                  });
                  setSecret(r.secret);
                  setQr(await QRCode.toString(r.otpauth_uri, { type: "svg", margin: 1, width: 184 }));
                  setStep("scan");
                });
              } else {
                void run(async () => {
                  const r = await call<{ recovery_codes: string[] }>("POST", "/auth/mfa/enable", { code });
                  setCodes(r.recovery_codes);
                  setStep("codes");
                });
              }
            }}
          >
            {step === "password" ? (
              <Field label="Password" htmlFor="mfa-pw">
                <input
                  id="mfa-pw"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </Field>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4">
                  {qr ? (
                    <div
                      className="rounded-md bg-white p-2"
                      role="img"
                      aria-label="QR code for your authenticator app"
                      dangerouslySetInnerHTML={{ __html: qr }}
                    />
                  ) : null}
                  <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                    <span className="text-muted text-xs">Can&apos;t scan? Enter this key instead:</span>
                    <span className="mono break-all">{secret?.match(/.{1,4}/g)?.join(" ")}</span>
                  </div>
                </div>
                <Field label="Code from the app" htmlFor="mfa-code">
                  <input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className={`${inputClass} mono max-w-[160px] tracking-[0.2em]`}
                  />
                </Field>
                <p className="text-muted text-xs">Turning this on signs you out everywhere else.</p>
              </>
            )}
            {error ? <p className="text-crit text-[13px]">{error}</p> : null}
          </form>
        )}
      </Dialog>

      <Dialog
        open={open === "disable"}
        onClose={reset}
        title="Turn off two-step verification?"
        description="Your account will be protected by your password alone."
        footer={
          <>
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" form="mfa-off" disabled={pending}>
              Turn off
            </Button>
          </>
        }
      >
        <form
          id="mfa-off"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await call("POST", "/auth/mfa/disable", { password, code });
              reset();
            });
          }}
        >
          <Field label="Password" htmlFor="off-pw">
            <input
              id="off-pw"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Code from the app or a recovery code" htmlFor="off-code">
            <input
              id="off-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} mono max-w-[200px]`}
            />
          </Field>
          {error ? <p className="text-crit text-[13px]">{error}</p> : null}
        </form>
      </Dialog>

      <Dialog
        open={open === "regenerate"}
        onClose={reset}
        title="New recovery codes"
        description={codes ? undefined : "Your old codes stop working as soon as new ones are created."}
        footer={
          codes ? (
            <Button variant="primary" onClick={reset}>
              I saved my codes
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={reset}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="mfa-regen" disabled={pending}>
                Create new codes
              </Button>
            </>
          )
        }
      >
        {codes ? (
          codesBlock
        ) : (
          <form
            id="mfa-regen"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await call<{ recovery_codes: string[] }>("POST", "/auth/mfa/recovery-codes", {
                  code,
                });
                setCodes(r.recovery_codes);
              });
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Code from the app" htmlFor="regen-code">
              <input
                id="regen-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} mono max-w-[160px] tracking-[0.2em]`}
              />
            </Field>
            {error ? <p className="text-crit text-[13px]">{error}</p> : null}
          </form>
        )}
      </Dialog>
    </div>
  );
}

export function RevokeSession({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await call("DELETE", `/auth/sessions/${id}`).catch(() => undefined);
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}

export function ChangePassword() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await call("POST", "/auth/password/change", { current_password: current, new_password: next });
      close();
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change your password.");
    } finally {
      setPending(false);
    }
  }

  const mismatch = confirm.length > 0 && confirm !== next;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button
          onClick={() => {
            setSaved(false);
            setOpen(true);
          }}
        >
          Change password
        </Button>
        {saved ? (
          <span className="text-ok inline-flex items-center gap-1 text-[13px]">
            <Check className="size-3.5" aria-hidden />
            Password changed. Other devices were signed out.
          </span>
        ) : null}
      </div>
      <Dialog
        open={open}
        onClose={close}
        title="Change password"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="change-password-form"
              variant="primary"
              disabled={pending || !current || next.length < 12 || next !== confirm}
            >
              {pending ? "Saving…" : "Change password"}
            </Button>
          </>
        }
      >
        <form id="change-password-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Current password" htmlFor="current-password">
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="New password" htmlFor="new-password" hint="At least 12 characters.">
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="confirm-password"
            error={mismatch ? "Passwords don't match." : null}
          >
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error ? <FormAlert>{error}</FormAlert> : null}
        </form>
      </Dialog>
    </div>
  );
}
