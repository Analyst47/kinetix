"use client";

import { ArrowLeft, Download, FileText, Printer, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

const SUFFIX: Record<string, string> = {
  markdown: "report.md",
  pdf: "report.pdf",
  cve: "cve.json",
  osv: "osv.json",
};

export async function downloadExport(org: string, project: string, id: string, format: string) {
  const csrf = document.cookie
    .split("; ")
    .find((c) => c.startsWith("kx_csrf="))
    ?.slice("kx_csrf=".length);
  const res = await fetch(`/api/v1/orgs/${org}/projects/${project}/findings/${id}/report/export`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-CSRF-Token": decodeURIComponent(csrf ?? "") },
    body: JSON.stringify({ format }),
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("Export failed. Reload the page and try again.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `${id}-${SUFFIX[format] ?? "report"}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportToolbar({ org, project, id }: { org: string; project: string; id: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="border-rule bg-raised sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-4 py-2.5 print:hidden">
      <Link
        href={`/${org}/${project}/findings/${id}`}
        className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to finding
      </Link>
      {error ? <span className="text-crit text-xs">{error}</span> : null}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button
          onClick={() => downloadExport(org, project, id, "pdf").catch((e: Error) => setError(e.message))}
        >
          <FileText aria-hidden />
          PDF
        </Button>
        <Button
          onClick={() =>
            downloadExport(org, project, id, "markdown").catch((e: Error) => setError(e.message))
          }
        >
          <Download aria-hidden />
          Markdown
        </Button>
        <Button
          onClick={() => downloadExport(org, project, id, "cve").catch((e: Error) => setError(e.message))}
          title="CVE Record Format 5.1, ready to submit to a CNA"
        >
          <ShieldAlert aria-hidden />
          CVE
        </Button>
        <Button
          onClick={() => downloadExport(org, project, id, "osv").catch((e: Error) => setError(e.message))}
          title="OSV advisory record"
        >
          <ShieldAlert aria-hidden />
          OSV
        </Button>
        <Button
          variant="primary"
          onClick={async () => {
            try {
              await call("POST", `/orgs/${org}/projects/${project}/findings/${id}/report/export`, {
                format: "print",
              });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Couldn't record the export.");
              return;
            }
            window.print();
          }}
        >
          <Printer aria-hidden />
          Print
        </Button>
      </div>
    </div>
  );
}
