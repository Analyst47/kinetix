"use client";

import { Check, ChevronDown, Paperclip, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass, textareaClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import { CLOSED, STATUS_LABEL } from "@/lib/format";
import type { FindingDetail, FindingStatus } from "@/lib/types";

function useFindingApi(org: string, project: string, id: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const base = `/orgs/${org}/projects/${project}/findings/${id}`;
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError(null);
    try {
      const result = await fn();
      startTransition(() => router.refresh());
      return result;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      return undefined;
    }
  }
  return { base, run, pending, error, setError };
}

// ── Status actions ────────────────────────────────────────────────────────────

const FORWARD_LABEL: Partial<Record<FindingStatus, string>> = {
  triage: "Move to triage",
  needs_validation: "Needs validation",
  confirmed: "Confirm finding",
  reported: "Mark reported",
  vendor_acknowledged: "Vendor acknowledged",
  fix_available: "Fix available",
  public_disclosure: "Publicly disclosed",
};

export function FindingActions({
  org,
  project,
  finding,
}: {
  org: string;
  project: string;
  finding: FindingDetail;
}) {
  const { base, run, pending, error } = useFindingApi(org, project, finding.public_id);
  const [closeOpen, setCloseOpen] = useState(false);
  const allowed = finding.allowed_transitions;
  const closures = allowed.filter((s) => CLOSED.includes(s));
  const forward = allowed.filter((s) => !CLOSED.includes(s));
  const ready = finding.readiness.every((r) => r.done);
  const primary: FindingStatus | undefined = forward.includes("confirmed") ? "confirmed" : forward.at(-1);
  const secondary = forward.filter((s) => s !== primary);

  const move = (status: FindingStatus, extra: Record<string, unknown> = {}) =>
    run(() => call("POST", `${base}/transitions`, { status, ...extra }));

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {closures.includes("false_positive") ? (
          <Button variant="ghost" disabled={pending} onClick={() => move("false_positive")}>
            Mark false positive
          </Button>
        ) : null}
        {closures.length > 0 ? (
          <Button variant="ghost" disabled={pending} onClick={() => setCloseOpen(true)}>
            Close as…
            <ChevronDown aria-hidden />
          </Button>
        ) : null}
        {secondary.map((s) => (
          <Button key={s} disabled={pending} onClick={() => move(s)}>
            {finding.status === "confirmed" && s === "needs_validation"
              ? "Reopen validation"
              : (FORWARD_LABEL[s] ?? STATUS_LABEL[s])}
          </Button>
        ))}
        {primary ? (
          <Button
            variant="primary"
            disabled={pending || (primary === "confirmed" && !ready)}
            aria-describedby={primary === "confirmed" ? "confirm-readiness" : undefined}
            onClick={() => move(primary)}
          >
            {primary === "confirmed" ? <Check aria-hidden /> : null}
            {FORWARD_LABEL[primary] ?? STATUS_LABEL[primary]}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-crit max-w-[48ch] text-right text-[13px]">
          {error}
        </p>
      ) : null}
      <CloseDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        options={closures}
        onSubmit={async (status, note, duplicateOf) => {
          const ok = await move(status, { note, duplicate_of: duplicateOf || undefined });
          if (ok !== undefined) setCloseOpen(false);
        }}
        error={error}
      />
    </div>
  );
}

function CloseDialog({
  open,
  onClose,
  options,
  onSubmit,
  error,
}: {
  open: boolean;
  onClose: () => void;
  options: FindingStatus[];
  onSubmit: (status: FindingStatus, note: string, duplicateOf: string) => void;
  error: string | null;
}) {
  const [status, setStatus] = useState<FindingStatus>(options[0] ?? "false_positive");
  const [note, setNote] = useState("");
  const [dup, setDup] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Close finding"
      description="Closing keeps the finding and its evidence. You can reopen it to triage later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSubmit(status, note, dup)}>
            Close finding
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium">Reason</legend>
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2.5">
              <input
                type="radio"
                name="reason"
                checked={status === o}
                onChange={() => setStatus(o)}
                className="size-4 accent-[var(--vg)]"
              />
              {STATUS_LABEL[o]}
            </label>
          ))}
        </fieldset>
        {status === "duplicate" ? (
          <Field label="Duplicate of" htmlFor="dup" hint="The finding ID this one repeats.">
            <input
              id="dup"
              value={dup}
              onChange={(e) => setDup(e.target.value.toUpperCase())}
              placeholder="FND-000127"
              className={`${inputClass} mono`}
            />
          </Field>
        ) : null}
        <Field label="Note" htmlFor="close-note" hint="Recorded in the chain of custody.">
          <textarea
            id="close-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={textareaClass}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-crit text-[13px]">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

// ── CVSS ──────────────────────────────────────────────────────────────────────

export function CvssEditor({
  org,
  project,
  finding,
  editable,
}: {
  org: string;
  project: string;
  finding: FindingDetail;
  editable: boolean;
}) {
  const { base, run, pending, error } = useFindingApi(org, project, finding.public_id);
  const [editing, setEditing] = useState(false);
  const [vector, setVector] = useState(
    finding.cvss_vector ?? "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N",
  );
  const [preview, setPreview] = useState<{ score: string; severity: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function check(v: string) {
    setVector(v);
    try {
      const r = await call<{ score: string; severity: string }>(
        "POST",
        `/orgs/${org}/projects/${project}/findings/cvss/score`,
        { vector: v },
      );
      setPreview(r);
      setPreviewError(null);
    } catch (err) {
      setPreview(null);
      setPreviewError(err instanceof ApiError ? err.message : null);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-0.5">
        {finding.cvss_score ? (
          <span>
            <span className="font-semibold">{finding.cvss_score}</span>{" "}
            <span className="text-muted text-xs">preliminary</span>
          </span>
        ) : (
          <span className="text-muted">Not assessed</span>
        )}
        {finding.cvss_vector ? (
          <span className="mono text-muted text-[11.5px] break-all">{finding.cvss_vector}</span>
        ) : null}
        {editable ? (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              void check(vector);
            }}
            className="text-vg self-start text-xs hover:underline"
          >
            {finding.cvss_vector ? "Edit vector" : "Assess"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="cvss" className="sr-only">
        CVSS vector
      </label>
      <textarea
        id="cvss"
        rows={3}
        value={vector}
        onChange={(e) => void check(e.target.value)}
        className={`${textareaClass} mono text-[12px] leading-[18px]`}
        spellCheck={false}
      />
      <p className="text-muted text-xs" aria-live="polite">
        {preview
          ? `Base score ${preview.score} (${preview.severity}). Your preliminary assessment.`
          : (previewError ?? "Enter a CVSS 4.0 or 3.1 vector.")}
      </p>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="h-7 px-2.5 text-[13px]"
          disabled={!preview || pending}
          onClick={async () => {
            const ok = await run(() => call("PATCH", base, { cvss_vector: vector }));
            if (ok !== undefined) setEditing(false);
          }}
        >
          Save score
        </Button>
        <Button variant="ghost" className="h-7 px-2.5 text-[13px]" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-crit text-xs">{error}</p> : null}
    </div>
  );
}

// ── Reproduction ──────────────────────────────────────────────────────────────

export function ReproductionEditor({
  org,
  project,
  finding,
  editable,
}: {
  org: string;
  project: string;
  finding: FindingDetail;
  editable: boolean;
}) {
  const { base, run, pending, error } = useFindingApi(org, project, finding.public_id);
  const [text, setText] = useState(finding.reproduction);
  const [saved, setSaved] = useState(false);
  const dirty = text !== finding.reproduction;

  return (
    <div className="flex flex-col gap-3 p-4">
      <label htmlFor="repro" className="text-muted text-[13px]">
        Steps another researcher can follow to see the issue on an authorized environment. Include versions,
        configuration and the exact input.
      </label>
      <textarea
        id="repro"
        rows={14}
        value={text}
        readOnly={!editable}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder={
          "1. Start juice-shop v17.1.1 locally with default config.\n2. POST /rest/user/login with email set to ' OR 1=1--\n3. Observe a token issued for the first user (admin)."
        }
        className={`${textareaClass} mono text-[12.5px] leading-5`}
        spellCheck={false}
      />
      <div className="flex items-center gap-3">
        {editable ? (
          <Button
            variant="primary"
            disabled={!dirty || pending}
            onClick={async () => {
              const ok = await run(() => call("PATCH", base, { reproduction: text }));
              if (ok !== undefined) setSaved(true);
            }}
          >
            Save steps
          </Button>
        ) : null}
        <span className="text-muted text-xs" aria-live="polite">
          {saved ? "Steps saved." : dirty ? "Unsaved changes." : null}
        </span>
        {error ? <span className="text-crit text-xs">{error}</span> : null}
      </div>
    </div>
  );
}

// ── Evidence ──────────────────────────────────────────────────────────────────

export function EvidenceUpload({
  org,
  project,
  findingId,
  compact = false,
}: {
  org: string;
  project: string;
  findingId: string;
  compact?: boolean;
}) {
  const { base, run, pending, error } = useFindingApi(org, project, findingId);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      await run(() => call("POST", `${base}/evidence`, form));
    }
    if (input.current) input.current.value = "";
  }

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => void upload(e.target.files)}
    />
  );

  if (compact) {
    return (
      <>
        {picker}
        <Button disabled={pending} onClick={() => input.current?.click()}>
          <Paperclip aria-hidden />
          {pending ? "Attaching…" : "Attach evidence"}
        </Button>
      </>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload(e.dataTransfer.files);
      }}
      className={`m-4 flex flex-col items-start gap-2 rounded-md border border-dashed p-4 ${drag ? "border-vg bg-vg-soft" : "border-rule-strong"}`}
    >
      {picker}
      <p className="text-[13px]">
        Drop files here or{" "}
        <button type="button" className="text-vg hover:underline" onClick={() => input.current?.click()}>
          choose files
        </button>
        . Each file is hashed with SHA-256 when it arrives and recorded in the chain of custody.
      </p>
      <p className="text-muted text-xs">
        Up to 25 MB per file. Files are always downloaded, never rendered in the browser.
      </p>
      {pending ? (
        <p className="text-muted flex items-center gap-2 text-xs">
          <Upload className="size-3.5" aria-hidden /> Uploading…
        </p>
      ) : null}
      {error ? <p className="text-crit text-xs">{error}</p> : null}
    </div>
  );
}

export function VerifyButton({
  org,
  project,
  findingId,
  evidenceId,
}: {
  org: string;
  project: string;
  findingId: string;
  evidenceId: string;
}) {
  const [state, setState] = useState<"idle" | "checking" | "ok" | "bad">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        setState("checking");
        const r = await call<{ verified: boolean }>(
          "POST",
          `/orgs/${org}/projects/${project}/findings/${findingId}/evidence/${evidenceId}/verify`,
        ).catch(() => ({ verified: false }));
        setState(r.verified ? "ok" : "bad");
      }}
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      aria-live="polite"
    >
      {state === "ok" ? (
        <span className="text-ok inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden /> Verified
        </span>
      ) : state === "bad" ? (
        <span className="text-crit">Hash mismatch</span>
      ) : (
        <span className="text-vg hover:underline">{state === "checking" ? "Checking…" : "Verify hash"}</span>
      )}
    </button>
  );
}

export function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 font-medium ${active ? "border-vg text-ink" : "text-muted hover:text-ink border-transparent"}`}
    >
      {children}
    </Link>
  );
}
