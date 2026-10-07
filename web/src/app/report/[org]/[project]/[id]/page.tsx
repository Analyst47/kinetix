import type { Metadata } from "next";

import { LogoMark } from "@/components/logo";
import { SeverityMark } from "@/components/ui";
import { AUTHORIZATION_LABEL, EVENT_LABEL, STATUS_LABEL, bytes, fullDate, shortDate } from "@/lib/format";
import { api } from "@/lib/server";
import type { FindingStatus, Severity } from "@/lib/types";

import { ReportToolbar } from "./toolbar";

interface Report {
  id: string;
  title: string;
  draft: boolean;
  status: FindingStatus;
  severity: Severity;
  cvss: { score: string; vector: string } | null;
  cwe: string | null;
  reference: string | null;
  location: string | null;
  description: string;
  reproduction: string;
  remediation: string | null;
  researcher: string | null;
  organization: string;
  product: { name: string; target: string | null; version: string | null; commit: string | null };
  discovered_at: string;
  confirmed_at: string | null;
  source: { path: string; start: number; highlight: number; lines: string[] } | null;
  evidence: { filename: string; size: number; sha256: string; added_at: string }[];
  authorization: {
    type: string;
    in_scope: string;
    out_of_scope: string;
    reference: string | null;
    attestation: string;
    attested_by: string;
    attested_at: string;
  };
  custody: { seq: number; at: string; actor: string; action: string; hash: string }[];
  chain: { verified: boolean; entries: number };
  disclosure: {
    vendor: string;
    contact: string;
    deadline_days: number;
    notified_at: string | null;
    deadline_at: string | null;
    cve_id: string | null;
    advisory_url: string | null;
    events: { kind: string; at: string; note: string }[];
  } | null;
  generated_at: string;
}

type Params = Promise<{ org: string; project: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: `${id} report` };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex break-inside-avoid-page flex-col gap-2.5">
      <h2 className="border-rule border-b pb-1.5 text-[15px] leading-[22px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Prose({ text, empty }: { text: string; empty: string }) {
  if (!text.trim()) return <p className="text-muted">{empty}</p>;
  return (
    <div className="flex max-w-[76ch] flex-col gap-2">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </div>
  );
}

export default async function ReportPage({ params }: { params: Params }) {
  const { org, project, id } = await params;
  const r = await api<Report>(`/orgs/${org}/projects/${project}/findings/${id}/report`);
  const rows: [string, React.ReactNode][] = [
    ["Product", r.product.name],
    [
      "Affected version",
      <span key="v" className="mono">
        {r.product.version ?? "—"}
        {r.product.commit ? ` (commit ${r.product.commit})` : ""}
      </span>,
    ],
    ["Severity", <SeverityMark key="s" severity={r.severity} />],
    [
      "CVSS",
      r.cvss ? (
        <span key="c">
          <span className="font-semibold">{r.cvss.score}</span>{" "}
          <span className="text-muted text-xs">preliminary</span>
          <span className="mono text-muted block text-[11.5px] break-all">{r.cvss.vector}</span>
        </span>
      ) : (
        "Not assessed"
      ),
    ],
    [
      "CWE",
      <span key="w" className="mono">
        {r.cwe ?? "—"}
      </span>,
    ],
    [
      "Location",
      <span key="l" className="mono break-all">
        {r.location ?? "—"}
      </span>,
    ],
    [
      "Reference",
      <span key="r" className="mono">
        {r.reference ?? "—"}
      </span>,
    ],
    ["Researcher", r.researcher ?? "—"],
    ["Status", STATUS_LABEL[r.status]],
    ["Discovered", fullDate(r.discovered_at)],
    ["Confirmed", r.confirmed_at ? fullDate(r.confirmed_at) : "Not confirmed"],
  ];

  return (
    <div className="bg-paper min-h-dvh print:bg-white">
      <ReportToolbar org={org} project={project} id={id} />
      <article className="bg-raised border-rule mx-auto my-6 flex max-w-[860px] flex-col gap-7 rounded-md border px-6 py-8 sm:px-12 sm:py-12 print:my-0 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-col gap-4">
          <div className="text-muted flex items-center gap-2.5 text-[13px]">
            <LogoMark size={16} />
            <span>Security vulnerability report</span>
            <span className="ml-auto">{r.organization}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[28px] leading-8 font-medium tracking-[-0.02em]">{r.id}</span>
            <h1 className="text-[24px] leading-[30px] font-semibold tracking-[-0.015em]">{r.title}</h1>
          </div>
          {r.draft ? (
            <p className="border-high/40 text-high rounded-sm border bg-[color-mix(in_oklab,var(--high)_8%,transparent)] px-3 py-2 text-[13px]">
              <strong>Draft.</strong> This finding has not been confirmed. Treat everything below as a
              hypothesis under investigation, not a verified vulnerability.
            </p>
          ) : null}
        </header>

        <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted text-xs leading-5">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <Section title="Summary">
          <Prose text={r.description} empty="No description provided." />
        </Section>

        {r.source ? (
          <Section title="Technical details">
            <p className="text-muted text-[13px]">
              <span className="mono text-ink">{r.source.path}</span>, lines {r.source.start}–
              {r.source.start + r.source.lines.length - 1}
            </p>
            <pre className="bg-sunken m-0 overflow-x-auto rounded-sm py-2 font-mono text-[12px] leading-5 print:whitespace-pre-wrap">
              {r.source.lines.map((line, i) => {
                const n = r.source!.start + i;
                return (
                  <div
                    key={n}
                    className={`flex ${n === r.source!.highlight ? "bg-crit-soft shadow-[inset_3px_0_0_var(--crit)]" : ""}`}
                  >
                    <span className="text-muted w-11 shrink-0 pr-3 text-right select-none">{n}</span>
                    <code className="pr-4">{line || " "}</code>
                  </div>
                );
              })}
            </pre>
          </Section>
        ) : null}

        <Section title="Reproduction">
          {r.reproduction.trim() ? (
            <pre className="bg-sunken m-0 rounded-sm px-4 py-3 font-mono text-[12.5px] leading-5 whitespace-pre-wrap">
              {r.reproduction}
            </pre>
          ) : (
            <p className="text-muted">No reproduction steps recorded.</p>
          )}
        </Section>

        <Section title="Evidence">
          {r.evidence.length ? (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-muted text-left text-xs">
                  <th className="border-rule border-b py-1.5 pr-4 font-medium">File</th>
                  <th className="border-rule border-b py-1.5 pr-4 font-medium">Size</th>
                  <th className="border-rule border-b py-1.5 font-medium">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {r.evidence.map((e) => (
                  <tr key={e.sha256 + e.filename} className="border-rule border-b last:border-b-0">
                    <td className="mono py-1.5 pr-4">{e.filename}</td>
                    <td className="py-1.5 pr-4 whitespace-nowrap">{bytes(e.size)}</td>
                    <td className="mono text-muted py-1.5 text-[11px] break-all">{e.sha256}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted">No evidence attached.</p>
          )}
        </Section>

        <Section title="Suggested remediation">
          <Prose text={r.remediation ?? ""} empty="Describe the fix for this issue." />
          {r.remediation && r.cwe ? (
            <p className="text-muted text-xs">General guidance for {r.cwe}. Adapt it to the affected code.</p>
          ) : null}
        </Section>

        <Section title="Authorization">
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-muted text-xs leading-5">Basis</dt>
            <dd>{AUTHORIZATION_LABEL[r.authorization.type] ?? r.authorization.type}</dd>
            {r.authorization.reference ? (
              <>
                <dt className="text-muted text-xs leading-5">Reference</dt>
                <dd className="break-all">{r.authorization.reference}</dd>
              </>
            ) : null}
            <dt className="text-muted text-xs leading-5">In scope</dt>
            <dd className="whitespace-pre-wrap">{r.authorization.in_scope}</dd>
            {r.authorization.out_of_scope ? (
              <>
                <dt className="text-muted text-xs leading-5">Out of scope</dt>
                <dd className="whitespace-pre-wrap">{r.authorization.out_of_scope}</dd>
              </>
            ) : null}
            <dt className="text-muted text-xs leading-5">Attestation</dt>
            <dd>
              <span className="text-muted">
                {r.authorization.attested_by}, {fullDate(r.authorization.attested_at)}:
              </span>{" "}
              {r.authorization.attestation}
            </dd>
          </dl>
        </Section>

        {r.disclosure ? (
          <Section title="Disclosure timeline">
            <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted text-xs leading-5">Vendor</dt>
              <dd>
                {r.disclosure.vendor} <span className="mono text-muted">{r.disclosure.contact}</span>
              </dd>
              <dt className="text-muted text-xs leading-5">Deadline</dt>
              <dd>
                {r.disclosure.deadline_at
                  ? `${shortDate(r.disclosure.deadline_at)} (${r.disclosure.deadline_days} days from notification)`
                  : `${r.disclosure.deadline_days} days from notification`}
              </dd>
              {r.disclosure.cve_id ? (
                <>
                  <dt className="text-muted text-xs leading-5">CVE</dt>
                  <dd className="mono">{r.disclosure.cve_id}</dd>
                </>
              ) : null}
              {r.disclosure.advisory_url ? (
                <>
                  <dt className="text-muted text-xs leading-5">Advisory</dt>
                  <dd className="break-all">{r.disclosure.advisory_url}</dd>
                </>
              ) : null}
            </dl>
            {r.disclosure.events.length ? (
              <ol className="flex flex-col gap-1.5 text-[13px]">
                {r.disclosure.events.map((e, i) => (
                  <li key={i} className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4">
                    <span className="text-muted">{shortDate(e.at)}</span>
                    <span>
                      <span className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                      {e.note ? <span className="text-muted">: {e.note}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted text-[13px]">The vendor has not been notified yet.</p>
            )}
          </Section>
        ) : null}

        <Section title="Chain of custody">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-muted text-left text-xs">
                {["#", "Time", "Actor", "Action", "Hash"].map((h) => (
                  <th key={h} className="border-rule border-b py-1.5 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.custody.map((e) => (
                <tr key={e.seq} className="border-rule border-b align-top last:border-b-0">
                  <td className="mono text-muted py-1.5 pr-3">{e.seq}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fullDate(e.at)}</td>
                  <td className="py-1.5 pr-3">{e.actor}</td>
                  <td className="mono py-1.5 pr-3">{e.action}</td>
                  <td className="mono text-muted py-1.5 text-[11px]">{e.hash.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={`text-[13px] ${r.chain.verified ? "text-ok" : "text-crit"}`}>
            {r.chain.verified
              ? `Chain verified: all ${r.chain.entries} workspace entries recompute from the first.`
              : "Chain verification failed. Entries in this ledger may have been altered."}
          </p>
        </Section>

        <footer className="text-muted border-rule border-t pt-3 text-xs">
          Generated by Kinetix for {r.organization} on {fullDate(r.generated_at)}. Each export is recorded in
          the chain of custody with the SHA-256 of the exported file.
        </footer>
      </article>
    </div>
  );
}
