"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass, textareaClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import type { FindingDetail } from "@/lib/types";

export function NewFindingButton({ org, project }: { org: string; project: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const line = form.get("line") as string;
    const cwe = (form.get("cwe") as string).trim();
    try {
      const f = await call<FindingDetail>("POST", `/orgs/${org}/projects/${project}/findings`, {
        title: form.get("title"),
        severity: form.get("severity"),
        cwe: cwe ? (cwe.toUpperCase().startsWith("CWE-") ? cwe.toUpperCase() : `CWE-${cwe}`) : null,
        file_path: (form.get("file_path") as string) || null,
        line: line ? Number(line) : null,
        description: form.get("description") ?? "",
      });
      setOpen(false);
      router.push(`/${org}/${project}/findings/${f.public_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the finding. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        New finding
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New finding"
        description="Record something you found by hand. It starts as Discovered until you validate it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="new-finding" disabled={pending}>
              {pending ? "Creating…" : "Create finding"}
            </Button>
          </>
        }
      >
        <form id="new-finding" action={submit} className="flex flex-col gap-4">
          <Field
            label="Title"
            htmlFor="nf-title"
            hint="Say what might be wrong and where. Hedge until confirmed."
          >
            <input
              id="nf-title"
              name="title"
              required
              minLength={3}
              placeholder="Potential IDOR in order lookup"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severity" htmlFor="nf-sev">
              <select id="nf-sev" name="severity" defaultValue="medium" className={inputClass}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
            </Field>
            <Field label="CWE" htmlFor="nf-cwe">
              <input id="nf-cwe" name="cwe" placeholder="CWE-639" className={`${inputClass} mono`} />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="File" htmlFor="nf-file">
              <input
                id="nf-file"
                name="file_path"
                placeholder="routes/order.ts"
                className={`${inputClass} mono`}
              />
            </Field>
            <Field label="Line" htmlFor="nf-line">
              <input id="nf-line" name="line" type="number" min={1} className={`${inputClass} mono`} />
            </Field>
          </div>
          <Field label="Description" htmlFor="nf-desc">
            <textarea id="nf-desc" name="description" rows={4} className={textareaClass} />
          </Field>
          {error ? (
            <p role="alert" className="text-crit text-[13px]">
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>
    </>
  );
}
