"use client";

import { Database } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";

/** Downloads every finding as a JSONL training dataset (features + the researcher's verdict). */
export function ExportDatasetButton({ org, project }: { org: string; project: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={busy}
        title="Export findings as JSONL (features + labels) to train a model"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const csrf = document.cookie
              .split("; ")
              .find((c) => c.startsWith("kx_csrf="))
              ?.slice("kx_csrf=".length);
            const res = await fetch(`/api/v1/orgs/${org}/projects/${project}/export/dataset`, {
              method: "POST",
              headers: { "X-CSRF-Token": decodeURIComponent(csrf ?? "") },
              credentials: "same-origin",
            });
            if (!res.ok) throw new Error("Export failed. Reload and try again.");
            const url = URL.createObjectURL(await res.blob());
            const a = document.createElement("a");
            a.href = url;
            a.download = `${project}-findings.jsonl`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Export failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Database aria-hidden />
        {busy ? "Exporting…" : "Export dataset"}
      </Button>
      {error ? <span className="text-crit text-xs">{error}</span> : null}
    </div>
  );
}
