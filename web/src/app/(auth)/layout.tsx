import { ArrowLeft, FileCheck2, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mkt grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="KinetixZero home">
            <Wordmark size={16} />
          </Link>
          <Link
            href="/"
            className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-[13px]"
          >
            <ArrowLeft className="size-3.5" />
            Back to site
          </Link>
        </div>
        <main className="flex flex-1 items-center py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </main>
        <p className="text-muted text-xs">
          KinetixZero assists research on targets you are authorized to analyze.
        </p>
      </div>
      <BrandPanel />
    </div>
  );
}

function BrandPanel() {
  const points = [
    { icon: <Sparkles className="size-4" />, text: "AI validation with cited, verifiable evidence" },
    { icon: <ShieldCheck className="size-4" />, text: "Read-only analysis, human in the loop" },
    { icon: <FileCheck2 className="size-4" />, text: "CVE 5.1, OSV and PDF disclosure packages" },
  ];
  return (
    <div
      aria-hidden
      className="border-rule bg-sunken relative hidden overflow-hidden border-l lg:flex lg:flex-col lg:justify-center"
    >
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
      <div className="halo pointer-events-none absolute inset-x-0 top-0 h-80" />
      <div className="relative px-14">
        <p className="text-signal font-mono text-[11px] tracking-[0.2em] uppercase">
          KinetixZero platform
        </p>
        <h2 className="display text-ink mt-5 max-w-[16ch] text-[40px]">
          Find the paths attackers would take.
        </h2>
        <ul className="mt-10 flex flex-col gap-4">
          {points.map((p) => (
            <li key={p.text} className="text-ink flex items-center gap-3 text-[14.5px]">
              <span className="border-rule bg-raised text-signal grid size-8 place-items-center rounded-md border">
                {p.icon}
              </span>
              {p.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
