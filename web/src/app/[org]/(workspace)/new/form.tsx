"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Panel, inputClass, textareaClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import type { Project } from "@/lib/types";

const TYPES = [
  { value: "open_source", label: "Open-source project", hint: "Public source you analyze locally." },
  { value: "bug_bounty", label: "Bug bounty scope", hint: "A program that lists this asset as in scope." },
  {
    value: "vendor_authorization",
    label: "Vendor authorization",
    hint: "Written permission from the owner.",
  },
  { value: "personal_lab", label: "Personal or lab environment", hint: "Systems you own and run." },
  {
    value: "organization_owned",
    label: "Organization-owned asset",
    hint: "Your employer's system, with approval.",
  },
];

const ATTESTATION =
  "I am authorized to analyze this target within the scope below. I will not test systems or components that are out of scope, and I will report confirmed vulnerabilities through coordinated disclosure.";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export function NewProjectForm({ org }: { org: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState("open_source");
  const [inScope, setInScope] = useState("");
  const [outScope, setOutScope] = useState("");
  const [reference, setReference] = useState("");
  const [expires, setExpires] = useState("");
  const [attest, setAttest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const needsReference = type === "bug_bounty" || type === "vendor_authorization";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const p = await call<Project>("POST", `/orgs/${org}/projects`, {
        name,
        slug,
        authorization_type: type,
        in_scope: inScope,
        out_of_scope: outScope,
        authorization_reference: reference || null,
        authorization_expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        attest,
      });
      router.push(`/${org}/${p.slug}/scans`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the project. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Panel title="Target">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="p-name">
            <input
              id="p-name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="OWASP Juice Shop"
              className={inputClass}
            />
          </Field>
          <Field label="URL name" htmlFor="p-slug" hint={`/${org}/${slug || "project"}`}>
            <input
              id="p-slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              className={`${inputClass} mono`}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Authorization boundary">
        <div className="flex flex-col gap-5 p-4">
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Why you are authorized</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {TYPES.map((t) => (
                <label
                  key={t.value}
                  className={clsx(
                    "flex cursor-pointer gap-2.5 rounded-md border px-3 py-2.5",
                    type === t.value ? "border-vg bg-vg-soft" : "border-rule hover:bg-paper",
                  )}
                >
                  <input
                    type="radio"
                    name="auth-type"
                    value={t.value}
                    checked={type === t.value}
                    onChange={() => setType(t.value)}
                    className="mt-0.5 size-4 accent-[var(--vg)]"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{t.label}</span>
                    <span className="text-muted text-xs">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field
            label={needsReference ? "Link to the program or authorization" : "Reference link (optional)"}
            htmlFor="p-ref"
            hint="An https:// link someone can check later."
          >
            <input
              id="p-ref"
              type="url"
              required={needsReference}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="https://github.com/juice-shop/juice-shop"
              className={inputClass}
            />
          </Field>

          <Field label="In scope" htmlFor="p-in" hint="Name the exact repository, version, package or host.">
            <textarea
              id="p-in"
              required
              rows={3}
              value={inScope}
              onChange={(e) => setInScope(e.target.value)}
              placeholder="Source code of juice-shop v17.1.1, analyzed locally."
              className={textareaClass}
            />
          </Field>
          <Field label="Out of scope" htmlFor="p-out" hint="What you will not touch.">
            <textarea
              id="p-out"
              rows={2}
              value={outScope}
              onChange={(e) => setOutScope(e.target.value)}
              placeholder="Any hosted instance not run by me."
              className={textareaClass}
            />
          </Field>
          <Field
            label="Review by"
            htmlFor="p-exp"
            hint="After this date, Kinetix blocks new scans until you renew."
          >
            <input
              id="p-exp"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={`${inputClass} max-w-[200px]`}
            />
          </Field>

          <label className="border-rule bg-sunken flex gap-3 rounded-md border p-3.5">
            <input
              type="checkbox"
              checked={attest}
              onChange={(e) => setAttest(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--vg)]"
            />
            <span className="text-[13px] leading-5">{ATTESTATION}</span>
          </label>
        </div>
      </Panel>

      {error ? (
        <p
          role="alert"
          className="border-crit/40 bg-crit-soft text-crit rounded-sm border px-3 py-2 text-[13px]"
        >
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!attest || pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
