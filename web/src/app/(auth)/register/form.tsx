"use client";

// Client form; the page wrapper passes `next` from the URL.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

import { safeNext } from "../login/form";

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", organization_name: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const me = await call<{ organizations: { slug: string }[] }>("POST", "/auth/register", form);
      router.push(next ? safeNext(next) : `/${me.organizations[0]!.slug}/new`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach KinetixZero. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="display text-ink text-[clamp(32px,4vw,40px)]">Create an account</h1>
        <p className="text-muted">You&apos;ll set up your first research project next.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" htmlFor="name">
          <input
            id="name"
            autoComplete="name"
            value={form.name}
            onChange={set("name")}
            className={inputClass}
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            className={inputClass}
          />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 12 characters. A passphrase works well.">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            className={inputClass}
          />
        </Field>
        <Field
          label="Workspace name"
          htmlFor="org"
          hint="Your lab, team or company. You can invite others later."
        >
          <input
            id="org"
            value={form.organization_name}
            onChange={set("organization_name")}
            className={inputClass}
          />
        </Field>
        {error ? (
          <p
            role="alert"
            className="border-crit/40 bg-crit-soft text-crit rounded-md border px-3 py-2 text-[13px]"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-muted">
        Already have an account?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="text-ink decoration-rule-strong hover:decoration-ink underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
