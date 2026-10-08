"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

interface TriageResult {
  reviewed: number;
  remaining: number;
  stopped: string | null;
  verdicts: Record<string, number>;
}

/** Runs the AI triage pass over open findings, in batches, until done or a limit is hit. */
export function TriageButton({ org, project }: { org: string; project: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote("Reviewing findings…");
    let reviewed = 0;
    const totals: Record<string, number> = {};
    try {
      // Review in batches of 8 so no single request runs too long; stop on rate/quota limits.
      for (let i = 0; i < 25; i++) {
        const r = await call<TriageResult>("POST", `/orgs/${org}/projects/${project}/ai/triage?limit=8`);
        reviewed += r.reviewed;
        for (const [k, v] of Object.entries(r.verdicts)) totals[k] = (totals[k] ?? 0) + v;
        setNote(`Reviewed ${reviewed}… ${r.remaining} left`);
        router.refresh();
        if (r.stopped) {
          setNote(
            r.stopped === "quota"
              ? `Reviewed ${reviewed}. The provider's quota is used up — try again later.`
              : `Reviewed ${reviewed}. Hit the hourly AI limit — run again later for the rest.`,
          );
          return;
        }
        if (r.remaining === 0 || r.reviewed === 0) break;
      }
      const real = totals.likely_vulnerable ?? 0;
      setNote(`Reviewed ${reviewed}. ${real} flagged likely real — filter by AI verdict to see them.`);
    } catch (err) {
      setNote(
        err instanceof ApiError
          ? err.message
          : "Couldn't run AI triage. Check that AI is turned on for this workspace.",
      );
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" disabled={busy} onClick={run}>
        <Sparkles aria-hidden />
        {busy ? "Triaging…" : "Triage with AI"}
      </Button>
      {note ? <span className="text-muted max-w-[42ch] text-right text-xs">{note}</span> : null}
    </div>
  );
}
