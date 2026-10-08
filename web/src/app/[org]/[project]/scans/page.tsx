import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { fullDate, relative, shortHash } from "@/lib/format";
import { api } from "@/lib/server";
import type { Scan, Target } from "@/lib/types";

import { AddRepository, AutoRefresh, StartScanButton, UploadSource } from "./client";

export const metadata: Metadata = { title: "Scans" };

const STATUS: Record<Scan["status"], { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "text-muted" },
  running: { label: "Running", cls: "text-vg" },
  succeeded: { label: "Finished", cls: "text-ink" },
  failed: { label: "Failed", cls: "text-crit" },
};

function summary(scan: Scan): string {
  const parts: string[] = [];
  const deps = scan.stats.dependencies as { packages?: number; findings?: number } | undefined;
  const secrets = scan.stats.secrets as { findings?: number } | undefined;
  const sast = scan.stats.sast as { findings?: number; skipped?: string } | undefined;
  if (deps?.packages !== undefined) parts.push(`${deps.packages} packages`);
  const created = (deps?.findings ?? 0) + (secrets?.findings ?? 0) + (sast?.findings ?? 0);
  if (scan.status === "succeeded") parts.push(`${created} new finding${created === 1 ? "" : "s"}`);
  if (sast?.skipped) parts.push("SAST skipped");
  return parts.join(", ");
}

export default async function ScansPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params;
  const base = `/orgs/${org}/projects/${project}`;
  const [scans, targets] = await Promise.all([
    api<Scan[]>(`${base}/scans`),
    api<Target[]>(`${base}/targets`),
  ]);
  const active =
    scans.some((s) => s.status === "queued" || s.status === "running") ||
    targets.some((t) => t.fetch_status === "pending");
  const targetName = new Map(targets.map((t) => [t.id, t]));

  return (
    <>
      <PageBar crumbs={[{ label: "Scans" }]} />
      {active ? <AutoRefresh /> : null}
      <main className="flex w-full max-w-[1400px] flex-col gap-5 p-4 md:p-6">
        <PageHeader
          title="Scans"
          description="Add a repository or upload a source snapshot, then analyze it for vulnerable dependencies, secrets and risky code patterns."
          actions={
            <>
              <AddRepository org={org} project={project} />
              <UploadSource org={org} project={project} />
            </>
          }
        />

        <Panel title="Targets">
          {targets.length === 0 ? (
            <EmptyState title="No targets yet">
              Add a public Git repository, or upload a .zip or .tar.gz of the source you are authorized to
              analyze. Either way, the code is checked for path traversal, links and oversized content before
              anything is stored.
            </EmptyState>
          ) : (
            <ul>
              {targets.map((t) => (
                <li
                  key={t.id}
                  className="border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">
                      {t.name}{" "}
                      {t.kind === "archive" && t.version ? (
                        <span className="mono text-muted">v{t.version}</span>
                      ) : null}
                    </span>
                    <span className="mono text-muted truncate">
                      {t.archive_sha256
                        ? `sha256:${shortHash(t.archive_sha256)}`
                        : t.locator.replace(/^https:\/\//, "")}
                      {t.kind === "repository" && t.version ? ` @ ${t.version}` : ""}
                      {t.commit ? `  commit ${t.commit.slice(0, 12)}` : ""}
                    </span>
                    {t.fetch_status === "failed" && t.fetch_error ? (
                      <span className="text-crit text-xs">{t.fetch_error}</span>
                    ) : null}
                  </div>
                  <span className="text-muted text-xs">
                    {t.fetch_status === "pending"
                      ? "Fetching…"
                      : t.fetch_status === "failed"
                        ? "Fetch failed"
                        : `Added ${relative(t.created_at).toLowerCase()}`}
                  </span>
                  <StartScanButton
                    org={org}
                    project={project}
                    targetId={t.id}
                    disabled={t.fetch_status !== "ready"}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="History">
          {scans.length === 0 ? (
            <EmptyState title="No scans yet">Start a scan on a target above.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="text-muted text-left text-xs leading-4">
                    {["Scan", "Target", "Analyzers", "Status", "Result", "Started"].map((h) => (
                      <th key={h} className="border-rule border-b px-3 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scans.map((s) => (
                    <tr key={s.id} className="border-rule border-b last:border-b-0">
                      <td className="mono px-3 py-2.5">SCN-{String(s.number).padStart(4, "0")}</td>
                      <td className="px-3 py-2.5">{targetName.get(s.target_id)?.name ?? "—"}</td>
                      <td className="text-muted px-3 py-2.5">{s.analyzers.join(", ")}</td>
                      <td className={`px-3 py-2.5 font-medium ${STATUS[s.status].cls}`}>
                        {STATUS[s.status].label}
                        {s.error ? <div className="text-crit text-xs font-normal">{s.error}</div> : null}
                      </td>
                      <td className="text-muted px-3 py-2.5">{summary(s)}</td>
                      <td className="text-muted px-3 py-2.5 whitespace-nowrap" title={fullDate(s.created_at)}>
                        {relative(s.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>
    </>
  );
}
