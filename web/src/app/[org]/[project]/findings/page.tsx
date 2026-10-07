import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";

import { PageBar } from "@/components/shell-context";
import { Avatar, Chip, EmptyState, PageHeader, SeverityMark, StatusLabel } from "@/components/ui";
import { SEVERITY_BG, SEVERITY_ORDER, SOURCE_LABEL, relative } from "@/lib/format";
import { api } from "@/lib/server";
import type { FindingPage, Scan, Severity, Target } from "@/lib/types";

import { FindingFilters } from "./filters";
import { NewFindingButton } from "./new-finding";

export const metadata: Metadata = { title: "Findings" };

const TABS = [
  { key: "open", label: "Open" },
  { key: "needs_validation", label: "Needs validation" },
  { key: "confirmed", label: "Confirmed" },
  { key: "reported", label: "Reported" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
] as const;

const PAGE_SIZE = 50;

type Search = { status?: string; severity?: string; source?: string; q?: string; page?: string };

export default async function FindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<Search>;
}) {
  const { org, project } = await params;
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "open";
  const severities = (sp.severity ?? "")
    .split(",")
    .filter((s): s is Severity => SEVERITY_ORDER.includes(s as Severity));
  const page = Math.max(1, Number(sp.page) || 1);

  const qs = new URLSearchParams({
    status,
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
  });
  severities.forEach((s) => qs.append("severity", s));
  if (sp.source) qs.set("source", sp.source);
  if (sp.q) qs.set("q", sp.q);

  const base = `/orgs/${org}/projects/${project}`;
  const [data, scans, targets] = await Promise.all([
    api<FindingPage>(`${base}/findings?${qs}`),
    api<Scan[]>(`${base}/scans`),
    api<Target[]>(`${base}/targets`),
  ]);
  const lastScan = scans.find((s) => s.finished_at);
  const lastTarget = lastScan ? targets.find((t) => t.id === lastScan.target_id) : undefined;
  const totalSev = SEVERITY_ORDER.reduce((n, s) => n + (data.severity_counts[s] ?? 0), 0);

  const tabHref = (key: string) => {
    const next = new URLSearchParams();
    if (key !== "open") next.set("status", key);
    if (sp.severity) next.set("severity", sp.severity);
    if (sp.source) next.set("source", sp.source);
    if (sp.q) next.set("q", sp.q);
    const s = next.toString();
    return `/${org}/${project}/findings${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageBar crumbs={[{ label: "Findings" }]} />
      <main className="flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
        <PageHeader
          title="Findings"
          description={
            <>
              {data.status_counts.open ?? 0} open
              {lastScan?.finished_at ? (
                <>
                  . Last scan finished {relative(lastScan.finished_at).toLowerCase()}
                  {lastTarget?.commit ? (
                    <>
                      {" "}
                      on commit <span className="mono">{lastTarget.commit}</span>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                ". No scans yet."
              )}
            </>
          }
          actions={<NewFindingButton org={org} project={project} />}
        />

        <section
          aria-label="Severity breakdown"
          className="border-rule bg-raised flex flex-wrap items-center gap-6 rounded-md border p-4"
        >
          <div className="flex min-w-[280px] flex-[1_1_420px] flex-col gap-2.5">
            <div
              className="bg-sunken flex h-2.5 gap-0.5 overflow-hidden rounded-sm"
              role="img"
              aria-label={`${totalSev} findings by severity`}
            >
              {SEVERITY_ORDER.map((s) =>
                data.severity_counts[s] ? (
                  <span key={s} className={SEVERITY_BG[s]} style={{ flex: data.severity_counts[s] }} />
                ) : null,
              )}
            </div>
            <div className="flex flex-wrap gap-5">
              {SEVERITY_ORDER.map((s) => (
                <SeverityMark key={s} severity={s} count={data.severity_counts[s] ?? 0} />
              ))}
            </div>
          </div>
          <nav aria-label="Status" className="bg-sunken flex flex-wrap gap-0.5 rounded-md p-0.5">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                aria-current={status === t.key ? "page" : undefined}
                className={clsx(
                  "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium",
                  status === t.key
                    ? "bg-raised text-ink shadow-[0_0_0_1px_var(--rule)]"
                    : "text-muted hover:text-ink",
                )}
              >
                {t.label}
                <span className="text-muted">{data.status_counts[t.key] ?? 0}</span>
              </Link>
            ))}
          </nav>
        </section>

        <FindingFilters />

        <section className="border-rule bg-raised overflow-x-auto rounded-md border">
          {data.items.length === 0 ? (
            <EmptyState title="No findings match these filters">
              Clear the filters, or start a scan from the Scans page to analyze a target.
            </EmptyState>
          ) : (
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="text-muted text-left text-xs leading-4 font-medium">
                  {["Severity", "ID", "Finding", "CWE", "Source", "Status", "Owner"].map((h) => (
                    <th key={h} className="border-rule border-b px-3 py-2.5 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="border-rule border-b px-3 py-2.5 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => {
                  const href = `/${org}/${project}/findings/${f.public_id}`;
                  return (
                    <tr key={f.id} className="group border-rule hover:bg-paper border-b last:border-b-0">
                      <td className="px-3 py-2.5 align-top">
                        <SeverityMark severity={f.severity} />
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        <Link href={href} className="mono text-ink hover:underline">
                          {f.public_id}
                        </Link>
                      </td>
                      <td className="min-w-[360px] px-3 py-2.5 align-top">
                        <Link href={href} className="text-ink font-medium group-hover:underline">
                          {f.title}
                        </Link>
                        <div className="mono text-muted truncate">
                          {[f.file_path && (f.line ? `${f.file_path}:${f.line}` : f.file_path), f.reference]
                            .filter(Boolean)
                            .join("  ")}
                        </div>
                      </td>
                      <td className="mono px-3 py-2.5 align-top whitespace-nowrap">{f.cwe ?? "—"}</td>
                      <td className="px-3 py-2.5 align-top">
                        <Chip>{SOURCE_LABEL[f.source]}</Chip>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <StatusLabel status={f.status} />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {f.assignee ? (
                          <Avatar name={f.assignee.name} />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="text-muted px-3 py-2.5 text-right align-top whitespace-nowrap">
                        <time dateTime={f.updated_at}>{relative(f.updated_at)}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {data.total > PAGE_SIZE ? (
          <div className="flex items-center gap-3">
            <span className="text-muted text-xs">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
            </span>
          </div>
        ) : (
          <span className="text-muted text-xs">
            Showing {data.items.length} of {data.total}
          </span>
        )}
      </main>
    </>
  );
}
