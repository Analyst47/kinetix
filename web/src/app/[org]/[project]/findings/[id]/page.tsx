import clsx from "clsx";
import { Check, Circle, Download, FileOutput, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageBar } from "@/components/shell-context";
import { ButtonLink, Chip, EmptyState, Panel, SeverityMark, StatusLabel } from "@/components/ui";
import {
  CLOSED,
  EVENT_LABEL,
  HEALTH_TEXT,
  LIFECYCLE,
  SOURCE_LABEL,
  STATUS_LABEL,
  bytes,
  clock,
  fullDate,
  relative,
  shortHash,
} from "@/lib/format";
import { api, apiOptional } from "@/lib/server";
import type {
  AiRun,
  AiStatus,
  AuditEvent,
  Chain,
  Disclosure,
  Evidence,
  FindingDetail,
  Me,
  SourceExcerpt,
} from "@/lib/types";

import { AssistantPanel, EditableText } from "./assistant";

import { DisclosureView, StartDisclosure } from "./disclosure";

import {
  CvssEditor,
  EvidenceUpload,
  FindingActions,
  ReproductionEditor,
  TabLink,
  VerifyButton,
} from "./actions";

type Params = Promise<{ org: string; project: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

const TABS = ["overview", "evidence", "reproduction", "disclosure", "activity"] as const;
type Tab = (typeof TABS)[number];

const WRITE_ROLES = ["owner", "admin", "researcher"];
const AI_ROLES = ["owner", "admin", "researcher", "reviewer"];

export default async function FindingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { org, project, id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";
  const base = `/orgs/${org}/projects/${project}/findings/${id}`;

  const [finding, custody, evidence, source, disclosure, me, aiStatus, aiRuns] = await Promise.all([
    api<FindingDetail>(base),
    api<{ events: AuditEvent[]; chain: Chain }>(`${base}/custody`),
    api<Evidence[]>(`${base}/evidence`),
    apiOptional<SourceExcerpt>(`${base}/source?context=6`),
    apiOptional<Disclosure>(`${base}/disclosure`),
    api<Me>("/auth/me"),
    api<AiStatus>(`/orgs/${org}/ai`),
    api<AiRun[]>(`${base}/ai`),
  ]);
  const aiReady = aiStatus.available && aiStatus.enabled;
  const role = me.organizations.find((o) => o.slug === org)?.role ?? "viewer";
  const editable = WRITE_ROLES.includes(role) && !CLOSED.includes(finding.status);
  const closed = CLOSED.includes(finding.status);
  const stage = LIFECYCLE.indexOf(finding.status);
  const canDisclose = stage >= LIFECYCLE.indexOf("confirmed");
  const href = (t: Tab) => `/${org}/${project}/findings/${id}${t === "overview" ? "" : `?tab=${t}`}`;
  const scanLabel = custody.events.at(-1)?.actor_label;

  return (
    <>
      <PageBar
        crumbs={[
          { label: "Findings", href: `/${org}/${project}/findings` },
          { label: finding.public_id, mono: true },
        ]}
      />
      <main className="flex w-full max-w-[1400px] flex-col gap-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="mr-auto flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="font-mono text-[28px] leading-8 font-medium tracking-[-0.02em]">
                {finding.public_id}
              </span>
              <SeverityMark severity={finding.severity} />
              <StatusLabel status={finding.status} />
              {finding.confidence === "firm" ? (
                <Chip
                  className="border-vg/30 bg-vg-soft text-vg"
                  title="A verified data-flow path, or a matched known-vulnerable dependency"
                >
                  Firm
                </Chip>
              ) : null}
            </div>
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">{finding.title}</h1>
            <p className="text-muted">
              {finding.source === "manual" ? "Recorded by hand" : `Found by ${SOURCE_LABEL[finding.source]}`}
              {scanLabel && finding.source !== "manual"
                ? ` in ${scanLabel.replace(/^Scan /, "scan ")}`
                : ""}{" "}
              on {fullDate(finding.created_at)}.
              {finding.assignee ? ` Assigned to ${finding.assignee.name}.` : " Unassigned."}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <ButtonLink href={`/report/${org}/${project}/${id}`}>
              <FileOutput aria-hidden />
              Report
            </ButtonLink>
            {editable ? <EvidenceUpload org={org} project={project} findingId={id} compact /> : null}
            {WRITE_ROLES.includes(role) || role === "reviewer" ? (
              <FindingActions org={org} project={project} finding={finding} />
            ) : null}
          </div>
        </div>

        {closed ? (
          <div className="border-rule bg-sunken flex items-center gap-2.5 rounded-md border px-4 py-3 text-[13px]">
            <Circle className="text-muted size-3.5" aria-hidden />
            Closed as <span className="font-semibold">{STATUS_LABEL[finding.status]}</span>. Its evidence and
            history are kept. Reopen it to triage to continue.
          </div>
        ) : (
          <ol aria-label="Lifecycle" className="flex overflow-x-auto">
            {LIFECYCLE.map((s, i) => (
              <li
                key={s}
                aria-current={i === stage ? "step" : undefined}
                className={clsx(
                  "flex min-w-[112px] flex-1 flex-col gap-2 text-xs leading-4",
                  i > 0 && "ml-1",
                  i < stage && "text-ink",
                  i === stage && "text-ink font-semibold",
                  i > stage && "text-muted",
                )}
              >
                <span
                  className={clsx(
                    "h-1 rounded-full",
                    i < stage && "bg-ink",
                    i === stage && "bg-vg",
                    i > stage && "bg-rule",
                  )}
                />
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
            <nav aria-label="Finding sections" className="border-rule flex gap-1 overflow-x-auto border-b">
              <TabLink href={href("overview")} active={tab === "overview"}>
                Overview
              </TabLink>
              <TabLink href={href("evidence")} active={tab === "evidence"}>
                Evidence <span className="text-muted">{evidence.length}</span>
              </TabLink>
              <TabLink href={href("reproduction")} active={tab === "reproduction"}>
                Reproduction
              </TabLink>
              <TabLink href={href("disclosure")} active={tab === "disclosure"}>
                Disclosure
                {disclosure ? (
                  <span className={HEALTH_TEXT[disclosure.health]}>
                    {disclosure.health === "overdue" || disclosure.health === "due_soon"
                      ? `${disclosure.days_remaining}d`
                      : null}
                  </span>
                ) : null}
              </TabLink>
              <TabLink href={href("activity")} active={tab === "activity"}>
                Activity <span className="text-muted">{custody.events.length}</span>
              </TabLink>
            </nav>

            {tab === "overview" ? (
              <>
                <SourcePanel source={source} finding={finding} />
                <AssistantPanel
                  org={org}
                  project={project}
                  finding={finding}
                  status={aiStatus}
                  runs={aiRuns}
                  canUse={AI_ROLES.includes(role)}
                  canEdit={editable}
                  canManage={role === "owner" || role === "admin"}
                />
                <EditableText
                  org={org}
                  project={project}
                  findingId={id}
                  field="description"
                  title="Description"
                  value={finding.description}
                  placeholder="What the weakness is, where it is, how attacker-controlled data reaches it, and the impact."
                  canEdit={editable}
                  canDraft={editable && aiReady}
                />
                <EditableText
                  org={org}
                  project={project}
                  findingId={id}
                  field="remediation"
                  title="Remediation"
                  value={finding.remediation}
                  fallback={finding.remediation_guidance}
                  placeholder="The concrete fix for this code, and any defense in depth."
                  canEdit={editable}
                  canDraft={editable && aiReady}
                />
                {finding.reference ? (
                  <p className="text-muted text-[13px]">
                    Reference: <span className="mono text-ink">{finding.reference}</span>
                  </p>
                ) : null}
              </>
            ) : null}

            {tab === "evidence" ? (
              <Panel title="Evidence" aside={<span className="text-muted text-xs">SHA-256 at upload</span>}>
                {evidence.length === 0 ? (
                  <EmptyState title="No evidence yet">
                    Attach requests, responses, screenshots or notes that show the issue. A finding can&apos;t
                    be confirmed without evidence.
                  </EmptyState>
                ) : (
                  <ul>
                    {evidence.map((e) => (
                      <li
                        key={e.id}
                        className="border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3"
                      >
                        <FileText className="text-muted size-4" aria-hidden />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="mono text-ink font-medium">{e.filename}</span>
                          <span className="text-muted text-xs">
                            {bytes(e.size)}, added by {e.uploaded_by.name}{" "}
                            {relative(e.created_at).toLowerCase()}
                          </span>
                        </div>
                        <span className="mono text-muted text-[11.5px]" title={e.sha256}>
                          sha256:{shortHash(e.sha256)}
                        </span>
                        <VerifyButton org={org} project={project} findingId={id} evidenceId={e.id} />
                        <a
                          href={`/api/v1${base}/evidence/${e.id}/download`}
                          className="text-muted hover:bg-rule hover:text-ink inline-flex size-8 items-center justify-center rounded-md"
                          aria-label={`Download ${e.filename}`}
                        >
                          <Download className="size-4" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {editable ? <EvidenceUpload org={org} project={project} findingId={id} /> : null}
              </Panel>
            ) : null}

            {tab === "reproduction" ? (
              <Panel title="Reproduction steps">
                <ReproductionEditor org={org} project={project} finding={finding} editable={editable} />
              </Panel>
            ) : null}

            {tab === "disclosure" ? (
              disclosure ? (
                <DisclosureView
                  org={org}
                  project={project}
                  findingId={id}
                  disclosure={disclosure}
                  editable={WRITE_ROLES.includes(role)}
                />
              ) : canDisclose && WRITE_ROLES.includes(role) ? (
                <StartDisclosure org={org} project={project} findingId={id} />
              ) : (
                <Panel title="Disclosure">
                  <EmptyState title="Not ready for disclosure">
                    {canDisclose
                      ? "No disclosure has been started for this finding."
                      : "Confirm this finding first. Only confirmed findings are disclosed to vendors."}
                  </EmptyState>
                </Panel>
              )
            ) : null}

            {tab === "activity" ? (
              <Panel title="Activity" aside={<ChainBadge chain={custody.chain} />}>
                <ol className="flex flex-col">
                  {custody.events.map((e) => (
                    <li
                      key={e.seq}
                      className="border-rule grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b px-4 py-3 last:border-b-0"
                    >
                      <span className="mono text-muted">#{e.seq}</span>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">{describe(e)}</span>
                        <span className="text-muted text-xs">
                          {e.actor_label}, {fullDate(e.created_at)}
                        </span>
                        <span className="mono text-muted text-[11.5px] break-all">
                          {e.hash}
                          <br />
                          prev {e.prev_hash}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </Panel>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
            {!closed && LIFECYCLE.indexOf(finding.status) < 3 ? (
              <Panel title="Ready to confirm" id="confirm-readiness">
                <ul className="flex flex-col gap-2 px-4 py-3">
                  {finding.readiness.map((r) => (
                    <li key={r.key} className="flex items-center gap-2 text-[13px]">
                      {r.done ? (
                        <Check className="text-ok size-3.5" aria-hidden />
                      ) : (
                        <Circle className="text-muted size-3.5" aria-hidden />
                      )}
                      <span className={r.done ? "text-ink" : "text-muted"}>
                        {r.label}
                        <span className="sr-only">{r.done ? " (done)" : " (to do)"}</span>
                      </span>
                      <span className="ml-auto text-xs">
                        {r.done ? (
                          <span className="text-muted">{r.detail}</span>
                        ) : (
                          <Link
                            href={href(
                              r.key === "reproduction"
                                ? "reproduction"
                                : r.key === "evidence"
                                  ? "evidence"
                                  : "overview",
                            )}
                            className="text-vg hover:underline"
                          >
                            {r.key === "cvss" ? "Assess below" : r.key === "evidence" ? "Attach" : "Write"}
                          </Link>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            <Panel title="Details">
              <dl className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-2.5 p-4">
                <dt className="text-muted text-xs leading-5">Severity</dt>
                <dd>
                  <SeverityMark severity={finding.severity} />
                </dd>
                <dt className="text-muted text-xs leading-5">CVSS</dt>
                <dd className="min-w-0">
                  <CvssEditor org={org} project={project} finding={finding} editable={editable} />
                </dd>
                <dt className="text-muted text-xs leading-5">CWE</dt>
                <dd className="mono">{finding.cwe ?? "—"}</dd>
                {finding.file_path ? (
                  <>
                    <dt className="text-muted text-xs leading-5">Location</dt>
                    <dd className="mono break-all">
                      {finding.file_path}
                      {finding.line ? `:${finding.line}` : ""}
                    </dd>
                  </>
                ) : null}
                {finding.rule_id ? (
                  <>
                    <dt className="text-muted text-xs leading-5">Rule</dt>
                    <dd className="mono break-all">{finding.rule_id}</dd>
                  </>
                ) : null}
                <dt className="text-muted text-xs leading-5">Updated</dt>
                <dd>{relative(finding.updated_at)}</dd>
              </dl>
            </Panel>

            <Panel title="Chain of custody">
              <ol className="px-4 pt-3 pb-1">
                {custody.events.slice(0, 6).map((e, i, arr) => (
                  <li key={e.seq} className="relative pb-3.5 pl-[22px]">
                    <span aria-hidden className="bg-vg absolute top-[6px] left-1 size-[9px] rounded-[2px]" />
                    {i < arr.length - 1 ? (
                      <span
                        aria-hidden
                        className="bg-rule-strong absolute top-[18px] bottom-0.5 left-2 w-px"
                      />
                    ) : null}
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{describe(e)}</span>
                      <time dateTime={e.created_at} className="text-muted ml-auto text-xs whitespace-nowrap">
                        {clock(e.created_at)}
                      </time>
                    </div>
                    <div className="text-muted text-xs">{e.actor_label}</div>
                    <div className="mono text-muted text-[11.5px]">
                      {shortHash(e.hash)} ← {e.seq === 1 ? "genesis" : shortHash(e.prev_hash)}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="border-rule flex items-center gap-2 border-t px-4 py-2.5">
                <ChainBadge chain={custody.chain} />
                {custody.events.length > 6 ? (
                  <Link href={href("activity")} className="text-vg ml-auto text-xs hover:underline">
                    All {custody.events.length} entries
                  </Link>
                ) : null}
              </div>
            </Panel>
          </div>
        </div>
      </main>
    </>
  );
}

function ChainBadge({ chain }: { chain: Chain }) {
  return chain.verified ? (
    <span className="inline-flex items-center gap-2 text-[13px]">
      <span className="text-ok inline-flex items-center gap-1.5 font-semibold">
        <ShieldCheck className="size-4" aria-hidden />
        Verified
      </span>
      <span className="text-muted text-xs">{chain.entries} entries, chain intact</span>
    </span>
  ) : (
    <span className="text-crit inline-flex items-center gap-1.5 text-[13px] font-semibold">
      <ShieldAlert className="size-4" aria-hidden />
      Chain broken at entry {chain.first_broken_seq}
    </span>
  );
}

const FIELD_LABEL: Record<string, string> = {
  cvss_vector: "CVSS score",
  remediation: "remediation",
  reproduction: "reproduction steps",
  assignee_id: "assignee",
  cwe: "CWE",
};

function describe(e: AuditEvent): string {
  const d = e.data as Record<string, string | undefined>;
  switch (e.action) {
    case "finding.created":
      return "Finding created";
    case "finding.status_changed":
      return `Status: ${STATUS_LABEL[d.from as keyof typeof STATUS_LABEL] ?? d.from} to ${STATUS_LABEL[d.to as keyof typeof STATUS_LABEL] ?? d.to}`;
    case "evidence.attached":
      return `Evidence attached: ${d.filename}`;
    case "report.exported":
      return `Report exported (${d.format === "print" ? "print" : d.format})`;
    case "disclosure.started":
      return `Disclosure started with ${d.vendor}`;
    case "disclosure.updated":
      return "Disclosure details updated";
    case "ai.analysis":
      return `AI analysis (${d.model})`;
    case "ai.question":
      return `AI question (${d.model})`;
    case "ai.draft_description":
    case "ai.draft_remediation":
      return `AI draft requested (${d.model})`;
    case "finding.updated":
      return `Updated ${Object.keys(e.data)
        .map((k) => FIELD_LABEL[k] ?? k.replaceAll("_", " "))
        .join(", ")}`;
    default:
      if (e.action.startsWith("disclosure.")) {
        return `Disclosure: ${EVENT_LABEL[e.action.slice(11)] ?? e.action.slice(11)}`;
      }
      return e.action;
  }
}

function SourcePanel({ source, finding }: { source: SourceExcerpt | null; finding: FindingDetail }) {
  if (!source) {
    return (
      <Panel title="Source">
        <EmptyState title="No source snapshot for this location">
          {finding.file_path
            ? `The analyzed snapshot doesn't include ${finding.file_path}.`
            : "This finding isn't tied to a file."}
        </EmptyState>
      </Panel>
    );
  }
  const first = source.lines[0]?.n ?? source.highlight;
  const last = source.lines.at(-1)?.n ?? source.highlight;
  return (
    <section className="border-rule bg-raised overflow-hidden rounded-md border">
      <div className="border-rule flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-4 py-2.5">
        <FileText className="text-muted size-4" aria-hidden />
        <span className="mono font-medium">{source.path}</span>
        <span className="text-muted text-xs">
          lines {first}–{last}
          {source.commit ? (
            <>
              {" "}
              at <span className="mono">{source.commit}</span>
            </>
          ) : null}
        </span>
      </div>
      <div className="bg-sunken overflow-x-auto py-2" role="region" aria-label="Source excerpt" tabIndex={0}>
        <pre className="m-0 font-mono text-[12.5px] leading-5">
          {source.lines.map((l) => (
            <div
              key={l.n}
              className={clsx(
                "flex whitespace-pre",
                l.n === source.highlight && "bg-crit-soft shadow-[inset_3px_0_0_var(--crit)]",
              )}
            >
              <span aria-hidden className="text-muted w-12 shrink-0 pr-3.5 text-right select-none">
                {l.n}
              </span>
              <code className="pr-4">{l.text || " "}</code>
            </div>
          ))}
        </pre>
      </div>
    </section>
  );
}
