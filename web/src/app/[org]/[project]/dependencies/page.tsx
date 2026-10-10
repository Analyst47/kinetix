import clsx from "clsx";
import { Check, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageBar } from "@/components/shell-context";
import { EmptyState, PageHeader, SeverityMark, buttonClass } from "@/components/ui";
import { api } from "@/lib/server";
import type { DependencyPage } from "@/lib/types";

export const metadata: Metadata = { title: "Dependencies" };

export default async function DependenciesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<{ pkg?: string; vulnerable?: string }>;
}) {
  const { org, project } = await params;
  const sp = await searchParams;
  const vulnerableOnly = sp.vulnerable === "1";
  const data = await api<DependencyPage>(
    `/orgs/${org}/projects/${project}/dependencies?limit=500${vulnerableOnly ? "&vulnerable_only=true" : ""}`,
  );
  const key = (d: { name: string; version: string }) => `${d.name}@${d.version}`;
  const selected = data.items.find((d) => key(d) === sp.pkg) ?? data.items[0];
  const path = `/${org}/${project}/dependencies`;
  const link = (next: { pkg?: string; vulnerable?: boolean }) => {
    const q = new URLSearchParams();
    const v = next.vulnerable ?? vulnerableOnly;
    if (v) q.set("vulnerable", "1");
    if (next.pkg) q.set("pkg", next.pkg);
    const s = q.toString();
    return `${path}${s ? `?${s}` : ""}`;
  };
  const manifests = new Set(data.items.map((d) => d.manifest)).size;

  return (
    <>
      <PageBar crumbs={[{ label: "Dependencies" }]} />
      <main className="flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
        <PageHeader
          title="Dependencies"
          description={`${data.total.toLocaleString()} packages from ${manifests} manifest${manifests === 1 ? "" : "s"}. ${data.vulnerable} with known advisories.`}
          actions={
            <a
              className={buttonClass("secondary")}
              href={`data:application/json,${encodeURIComponent(
                JSON.stringify(
                  {
                    bomFormat: "CycloneDX",
                    specVersion: "1.5",
                    components: data.items.map((d) => ({
                      type: "library",
                      name: d.name,
                      version: d.version,
                      purl: `pkg:${d.ecosystem.toLowerCase()}/${d.name}@${d.version}`,
                    })),
                  },
                  null,
                  2,
                ),
              )}`}
              download={`${project}-sbom.cdx.json`}
            >
              <Download aria-hidden />
              Download SBOM
            </a>
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={link({ vulnerable: !vulnerableOnly, pkg: sp.pkg })}
            role="switch"
            aria-checked={vulnerableOnly}
            className="inline-flex items-center gap-2 font-medium"
          >
            <span
              aria-hidden
              className={clsx(
                "inline-flex size-4 items-center justify-center rounded-[3px] border",
                vulnerableOnly ? "border-brand bg-brand text-on-brand" : "border-rule-strong bg-raised",
              )}
            >
              {vulnerableOnly ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            Only packages with advisories
          </Link>
        </div>

        {data.items.length === 0 ? (
          <section className="border-rule bg-raised rounded-md border">
            <EmptyState title="No dependencies yet">
              Run a scan with the dependency analyzer to read lockfiles and match packages against OSV.
            </EmptyState>
          </section>
        ) : (
          <div className="flex flex-wrap items-start gap-5">
            <section className="border-rule bg-raised min-w-0 flex-[999_1_520px] overflow-x-auto rounded-md border">
              <table className="w-full min-w-[620px] border-collapse">
                <thead>
                  <tr className="text-muted text-left text-xs leading-4">
                    {["Package", "Version", "Scope", "License", "Advisories", "Fixed in"].map((h) => (
                      <th key={h} className="border-rule border-b px-3 py-2.5 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((d) => {
                    const active = selected && key(d) === key(selected);
                    return (
                      <tr
                        key={d.id}
                        className={clsx(
                          "border-rule border-b last:border-b-0",
                          active ? "bg-brand-soft" : "hover:bg-paper",
                        )}
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={link({ pkg: key(d) })}
                            scroll={false}
                            aria-current={active ? "true" : undefined}
                            className="mono text-ink font-medium hover:underline"
                          >
                            {d.name}
                          </Link>
                        </td>
                        <td className="mono px-3 py-2">{d.version}</td>
                        <td className="text-muted px-3 py-2">{d.direct ? "Direct" : "Transitive"}</td>
                        <td className="text-muted px-3 py-2">{d.license ?? "—"}</td>
                        <td className="px-3 py-2">
                          {d.max_severity ? (
                            <span className="flex items-center gap-2.5">
                              <SeverityMark severity={d.max_severity} />
                              <span className="text-muted">{d.advisories.length}</span>
                            </span>
                          ) : (
                            <span className="text-muted text-[13px]">None known</span>
                          )}
                        </td>
                        <td className="mono px-3 py-2">{d.fixed_version ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {selected ? (
              <aside
                aria-label="Package detail"
                className="border-rule bg-raised min-w-0 flex-[1_1_380px] rounded-md border"
              >
                <div className="flex flex-col gap-2.5 p-4">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <span className="font-mono text-lg leading-6 font-medium">{selected.name}</span>
                    <span className="mono text-muted">{selected.version}</span>
                  </div>
                  <dl className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-muted text-xs leading-5">Introduced by</dt>
                    <dd className="mono">
                      {selected.direct
                        ? `${project} → ${key(selected)}`
                        : `transitive (${selected.manifest})`}
                    </dd>
                    <dt className="text-muted text-xs leading-5">Manifest</dt>
                    <dd className="mono">{selected.manifest}</dd>
                    <dt className="text-muted text-xs leading-5">Upgrade</dt>
                    <dd>
                      {selected.fixed_version ? (
                        <>
                          To <span className="mono">{selected.fixed_version}</span> or later
                          {majorJump(selected.version, selected.fixed_version)
                            ? ". Major version jump: review the changelog."
                            : "."}
                        </>
                      ) : selected.advisories.length ? (
                        "No fixed version published."
                      ) : (
                        "No upgrade needed."
                      )}
                    </dd>
                  </dl>
                  {selected.finding_public_id ? (
                    <div className="mt-1 flex items-center gap-2 text-[13px]">
                      <span className="text-muted">Tracked as</span>
                      <Link
                        href={`/${org}/${project}/findings/${selected.finding_public_id}`}
                        className="mono text-brand hover:underline"
                      >
                        {selected.finding_public_id}
                      </Link>
                    </div>
                  ) : null}
                </div>
                {selected.advisories.length === 0 ? (
                  <p className="border-rule text-muted border-t px-4 py-3.5">
                    No known advisories for this version as of the last OSV sync.
                  </p>
                ) : (
                  selected.advisories.map((a) => (
                    <div key={a.id} className="border-rule flex flex-col gap-1.5 border-t px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {a.severity ? <SeverityMark severity={a.severity} /> : null}
                        <a
                          href={
                            a.display_id.startsWith("CVE-")
                              ? `https://www.cve.org/CVERecord?id=${a.display_id}`
                              : `https://osv.dev/vulnerability/${a.id}`
                          }
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mono text-brand hover:underline"
                        >
                          {a.display_id}
                        </a>
                        <span className="mono text-muted ml-auto text-xs">{a.cwe_ids[0] ?? ""}</span>
                      </div>
                      <p>{a.summary}</p>
                      <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 text-[13px]">
                        <dt className="text-muted text-xs leading-5">Affected</dt>
                        <dd className="mono">{a.affected_range || "—"}</dd>
                        <dt className="text-muted text-xs leading-5">Fixed</dt>
                        <dd className="mono">{a.fixed_version ?? "—"}</dd>
                      </dl>
                    </div>
                  ))
                )}
              </aside>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}

function majorJump(from: string, to: string): boolean {
  const a = Number(from.split(".")[0]);
  const b = Number(to.split(".")[0]);
  return Number.isFinite(a) && Number.isFinite(b) && b > a;
}
