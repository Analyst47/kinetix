"use client";

import clsx from "clsx";
import { Check, Copy, ExternalLink, Mail, Search, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog } from "@/components/dialog";
import { Button, EmptyState, Field, Panel, inputClass, textareaClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import {
  DISCLOSURE_STAGES,
  EVENT_LABEL,
  HEALTH_TEXT,
  deadlineLabel,
  fullDate,
  shortDate,
} from "@/lib/format";
import type { Disclosure } from "@/lib/types";

const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "web_form", label: "Vendor web form" },
  { value: "bug_bounty", label: "Bug bounty platform" },
  { value: "cna", label: "CVE Numbering Authority" },
];

interface SecurityTxt {
  domain: string;
  url: string;
  contacts: string[];
  policy: string[];
  encryption: string[];
  expires: string | null;
  warnings: string[];
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Start ─────────────────────────────────────────────────────────────────────

export function StartDisclosure({
  org,
  project,
  findingId,
}: {
  org: string;
  project: string;
  findingId: string;
}) {
  const router = useRouter();
  const [vendor, setVendor] = useState("");
  const [domain, setDomain] = useState("");
  const [contact, setContact] = useState("");
  const [source, setSource] = useState("manual");
  const [channel, setChannel] = useState("email");
  const [policy, setPolicy] = useState("");
  const [days, setDays] = useState(90);
  const [lookup, setLookup] = useState<SecurityTxt | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function find() {
    setLooking(true);
    setLookup(null);
    setLookupError(null);
    try {
      const r = await call<SecurityTxt>("POST", `/orgs/${org}/security-txt`, { domain });
      setLookup(r);
      if (r.contacts[0]) {
        setContact(r.contacts[0]);
        setSource("security_txt");
        setChannel(r.contacts[0].startsWith("mailto:") ? "email" : "web_form");
      }
      if (r.policy[0]) setPolicy(r.policy[0]);
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : "Lookup failed.");
    } finally {
      setLooking(false);
    }
  }

  return (
    <Panel title="Start coordinated disclosure">
      <form
        className="flex flex-col gap-5 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            await call("POST", `/orgs/${org}/projects/${project}/findings/${findingId}/disclosure`, {
              vendor_name: vendor,
              contact,
              contact_source: source,
              channel,
              policy_url: policy || null,
              deadline_days: days,
            });
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't start the disclosure.");
            setPending(false);
          }
        }}
      >
        <p className="text-muted max-w-[68ch] text-[13px]">
          Record who you will notify and on what timeline. Nothing is sent from Kinetix: you contact the
          vendor yourself, then log each step here so the record stays complete.
        </p>
        <Field label="Vendor" htmlFor="d-vendor">
          <input
            id="d-vendor"
            required
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Example Corporation"
            className={inputClass}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-domain" className="text-[13px] font-medium">
            Find the vendor&apos;s security contact
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="d-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className={`${inputClass} max-w-[280px]`}
            />
            <Button disabled={!domain || looking} onClick={find}>
              <Search aria-hidden />
              {looking ? "Looking…" : "Check security.txt"}
            </Button>
          </div>
          {lookupError ? <p className="text-muted text-xs">{lookupError}</p> : null}
          {lookup ? (
            <div className="border-rule bg-sunken mt-1 flex flex-col gap-1.5 rounded-md border p-3 text-[13px]">
              <span className="mono text-muted text-xs">{lookup.url}</span>
              {lookup.contacts.map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="contact-pick"
                    checked={contact === c}
                    onChange={() => {
                      setContact(c);
                      setSource("security_txt");
                    }}
                    className="size-4 accent-[var(--vg)]"
                  />
                  <span className="mono break-all">{c}</span>
                </label>
              ))}
              {lookup.warnings.map((w) => (
                <span key={w} className="text-med flex items-center gap-1.5 text-xs">
                  <ShieldAlert className="size-3.5" aria-hidden />
                  {w}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <Field
            label="Contact"
            htmlFor="d-contact"
            hint="An email address (mailto:) or the URL of a report form."
          >
            <input
              id="d-contact"
              required
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                setSource("manual");
              }}
              placeholder="mailto:security@example.com"
              className={`${inputClass} mono`}
            />
          </Field>
          <Field label="Channel" htmlFor="d-channel">
            <select
              id="d-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className={inputClass}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <Field label="Vendor disclosure policy (optional)" htmlFor="d-policy">
            <input
              id="d-policy"
              type="url"
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              placeholder="https://example.com/security"
              className={inputClass}
            />
          </Field>
          <Field
            label="Disclosure deadline"
            htmlFor="d-days"
            hint="Counted from the day you notify the vendor."
          >
            <select
              id="d-days"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={inputClass}
            >
              {[45, 60, 90, 120].map((n) => (
                <option key={n} value={n}>
                  {n} days{n === 90 ? " (industry norm)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {error ? <p className="text-crit text-[13px]">{error}</p> : null}
        <div>
          <Button type="submit" variant="primary" disabled={pending || !vendor || !contact}>
            {pending ? "Starting…" : "Start disclosure"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ── Timeline view ─────────────────────────────────────────────────────────────

export function DisclosureView({
  org,
  project,
  findingId,
  disclosure: d,
  editable,
}: {
  org: string;
  project: string;
  findingId: string;
  disclosure: Disclosure;
  editable: boolean;
}) {
  const stageIndex = DISCLOSURE_STAGES.findIndex((s) => s.key === d.stage);
  const total =
    d.notified_at && d.deadline_at
      ? Math.round((new Date(d.deadline_at).getTime() - new Date(d.notified_at).getTime()) / 86400000)
      : d.deadline_days;
  const elapsed = d.days_remaining !== null ? Math.max(0, total - d.days_remaining) : 0;
  const pct = d.health === "complete" ? 100 : Math.min(100, Math.round((elapsed / Math.max(total, 1)) * 100));

  return (
    <div className="flex flex-col gap-4">
      <section className="border-rule bg-raised rounded-md border">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 p-4">
          <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
            <span className="text-muted text-xs">Vendor</span>
            <span className="font-semibold">{d.vendor_name}</span>
            <ContactLink contact={d.contact} />
            {d.policy_url ? (
              <a
                href={d.policy_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-vg inline-flex items-center gap-1 text-xs hover:underline"
              >
                Disclosure policy <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="text-muted text-xs">Deadline</span>
            <span
              className={clsx(
                "text-[22px] leading-7 font-semibold tracking-[-0.015em]",
                HEALTH_TEXT[d.health],
              )}
            >
              {deadlineLabel(d.days_remaining, d.health)}
            </span>
            <span className="text-muted text-xs">
              {d.deadline_at
                ? `${shortDate(d.deadline_at)}, ${d.deadline_days}-day policy`
                : `${d.deadline_days} days once the vendor is notified`}
            </span>
          </div>
        </div>
        {d.notified_at ? (
          <div className="px-4 pb-4">
            <div
              className="bg-sunken relative h-1.5 overflow-hidden rounded-full"
              role="meter"
              aria-label="Time elapsed toward the disclosure deadline"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={Math.min(elapsed, total)}
            >
              <span
                className={clsx(
                  "absolute inset-y-0 left-0 rounded-full",
                  d.health === "overdue"
                    ? "bg-crit"
                    : d.health === "due_soon"
                      ? "bg-med"
                      : d.health === "complete"
                        ? "bg-ok"
                        : "bg-vg",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-muted mt-1.5 flex justify-between text-xs">
              <span>Notified {shortDate(d.notified_at)}</span>
              <span>
                Day {Math.min(elapsed, 999)} of {total}
              </span>
            </div>
          </div>
        ) : null}
        <ol aria-label="Disclosure stage" className="border-rule flex overflow-x-auto border-t px-4 py-3">
          {DISCLOSURE_STAGES.map((s, i) => (
            <li
              key={s.key}
              aria-current={i === stageIndex ? "step" : undefined}
              className={clsx(
                "flex min-w-[96px] flex-1 flex-col gap-1.5 text-xs",
                i > 0 && "ml-1",
                i <= stageIndex ? "text-ink" : "text-muted",
                i === stageIndex && "font-semibold",
              )}
            >
              <span
                className={clsx(
                  "h-1 rounded-full",
                  i < stageIndex && "bg-ink",
                  i === stageIndex && "bg-vg",
                  i > stageIndex && "bg-rule",
                )}
              />
              {s.label}
            </li>
          ))}
        </ol>
        {d.cve_id || d.advisory_url ? (
          <div className="border-rule flex flex-wrap gap-x-6 gap-y-1 border-t px-4 py-3 text-[13px]">
            {d.cve_id ? (
              <span>
                <span className="text-muted">CVE </span>
                <a
                  href={`https://www.cve.org/CVERecord?id=${d.cve_id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mono text-vg hover:underline"
                >
                  {d.cve_id}
                </a>
              </span>
            ) : null}
            {d.advisory_url ? (
              <a
                href={d.advisory_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-vg inline-flex items-center gap-1 hover:underline"
              >
                Public advisory <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <Panel
          title="Timeline"
          className="min-w-0 flex-[999_1_420px]"
          aside={<DraftButton org={org} project={project} findingId={findingId} contact={d.contact} />}
        >
          {d.events.length === 0 ? (
            <EmptyState title="Nothing recorded yet">
              Draft the notification, send it to {d.vendor_name}, then record &quot;Vendor notified&quot; to
              start the {d.deadline_days}-day clock.
            </EmptyState>
          ) : (
            <ol className="px-4 pt-3 pb-1">
              {[...d.events].reverse().map((e, i, arr) => (
                <li key={e.id} className="relative pb-4 pl-[22px]">
                  <span aria-hidden className="bg-vg absolute top-[6px] left-1 size-[9px] rounded-[2px]" />
                  {i < arr.length - 1 ? (
                    <span aria-hidden className="bg-rule-strong absolute top-[18px] bottom-0.5 left-2 w-px" />
                  ) : null}
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                    {e.kind === "extension" && e.data.days ? (
                      <span className="text-muted text-xs">+{String(e.data.days)} days</span>
                    ) : null}
                    {e.kind === "cve_assigned" && e.data.cve_id ? (
                      <span className="mono text-xs">{String(e.data.cve_id)}</span>
                    ) : null}
                    <time dateTime={e.occurred_at} className="text-muted ml-auto text-xs">
                      {shortDate(e.occurred_at)}
                    </time>
                  </div>
                  {e.note ? <p className="mt-0.5 text-[13px] whitespace-pre-wrap">{e.note}</p> : null}
                  <span className="text-muted text-xs">
                    Recorded by {e.created_by.name}, {fullDate(e.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        {editable && d.allowed_events.length ? (
          <RecordEvent org={org} project={project} findingId={findingId} allowed={d.allowed_events} />
        ) : null}
      </div>
    </div>
  );
}

function ContactLink({ contact }: { contact: string }) {
  if (contact.startsWith("mailto:")) {
    return (
      <a href={contact} className="mono text-vg text-[13px] break-all hover:underline">
        {contact.slice(7)}
      </a>
    );
  }
  if (contact.startsWith("https://")) {
    return (
      <a
        href={contact}
        target="_blank"
        rel="noreferrer noopener"
        className="mono text-vg text-[13px] break-all hover:underline"
      >
        {contact}
      </a>
    );
  }
  return <span className="mono text-[13px] break-all">{contact}</span>;
}

function RecordEvent({
  org,
  project,
  findingId,
  allowed,
}: {
  org: string;
  project: string;
  findingId: string;
  allowed: string[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState(allowed[0]!);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [days, setDays] = useState(30);
  const [cve, setCve] = useState("");
  const [advisory, setAdvisory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const current = allowed.includes(kind) ? kind : allowed[0]!;

  return (
    <Panel title="Record a step" className="min-w-0 flex-[1_1_300px]">
      <form
        className="flex flex-col gap-3.5 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            await call("POST", `/orgs/${org}/projects/${project}/findings/${findingId}/disclosure/events`, {
              kind: current,
              occurred_at: new Date(`${date}T12:00:00`).toISOString(),
              note,
              ...(current === "extension" ? { days } : {}),
              ...(current === "cve_assigned" ? { cve_id: cve.trim().toUpperCase() } : {}),
              ...(current === "public_disclosure" && advisory ? { advisory_url: advisory } : {}),
            });
            setNote("");
            setCve("");
            setAdvisory("");
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't record that step.");
          } finally {
            setPending(false);
          }
        }}
      >
        <Field label="What happened" htmlFor="ev-kind">
          <select
            id="ev-kind"
            value={current}
            onChange={(e) => setKind(e.target.value)}
            className={inputClass}
          >
            {allowed.map((k) => (
              <option key={k} value={k}>
                {EVENT_LABEL[k] ?? k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" htmlFor="ev-date">
          <input
            id="ev-date"
            type="date"
            max={today()}
            suppressHydrationWarning
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputClass} max-w-[180px]`}
          />
        </Field>
        {current === "extension" ? (
          <Field label="Extend by (days)" htmlFor="ev-days">
            <input
              id="ev-days"
              type="number"
              min={1}
              max={180}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={`${inputClass} max-w-[120px]`}
            />
          </Field>
        ) : null}
        {current === "cve_assigned" ? (
          <Field label="CVE ID" htmlFor="ev-cve">
            <input
              id="ev-cve"
              required
              value={cve}
              onChange={(e) => setCve(e.target.value)}
              placeholder="CVE-2026-12345"
              className={`${inputClass} mono`}
            />
          </Field>
        ) : null}
        {current === "public_disclosure" ? (
          <Field label="Advisory URL (optional)" htmlFor="ev-adv">
            <input
              id="ev-adv"
              type="url"
              value={advisory}
              onChange={(e) => setAdvisory(e.target.value)}
              placeholder="https://"
              className={inputClass}
            />
          </Field>
        ) : null}
        <Field label="Note" htmlFor="ev-note">
          <textarea
            id="ev-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={textareaClass}
          />
        </Field>
        {current === "notified" ? (
          <p className="text-muted text-xs">This starts the deadline clock and marks the finding Reported.</p>
        ) : null}
        {error ? <p className="text-crit text-[13px]">{error}</p> : null}
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Recording…" : "Record step"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function DraftButton({
  org,
  project,
  findingId,
  contact,
}: {
  org: string;
  project: string;
  findingId: string;
  contact: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    if (!draft) {
      const r = await call<{ subject: string; body: string }>(
        "GET",
        `/orgs/${org}/projects/${project}/findings/${findingId}/disclosure/draft`,
      );
      setDraft(r);
    }
  }

  async function copy(what: "subject" | "body") {
    if (!draft) return;
    await navigator.clipboard.writeText(draft[what]);
    setCopied(what);
  }

  const mailto =
    draft && contact.startsWith("mailto:")
      ? `${contact}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
      : null;

  return (
    <>
      <Button className="h-7 px-2.5 text-[13px]" onClick={show}>
        <Mail aria-hidden />
        Draft notification
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        width={720}
        title="Draft notification"
        description="A starting point to edit before you send it. Kinetix doesn't send anything on your behalf."
        footer={
          <>
            {mailto ? (
              <a
                href={mailto}
                className="border-rule-strong bg-raised hover:bg-paper inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium [&_svg]:size-4"
              >
                <Mail aria-hidden />
                Open in mail app
              </a>
            ) : null}
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input readOnly value={draft.subject} aria-label="Subject" className={inputClass} />
              <Button onClick={() => copy("subject")}>
                {copied === "subject" ? <Check aria-hidden /> : <Copy aria-hidden />}
                Subject
              </Button>
            </div>
            <textarea
              readOnly
              rows={18}
              value={draft.body}
              aria-label="Message body"
              className={`${textareaClass} mono text-[12px] leading-[18px]`}
            />
            <div>
              <Button onClick={() => copy("body")}>
                {copied === "body" ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied === "body" ? "Copied" : "Copy message"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted">Preparing the draft…</p>
        )}
      </Dialog>
    </>
  );
}
