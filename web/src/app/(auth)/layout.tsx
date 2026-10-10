import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark, Wordmark } from "@/components/logo";
import { DotGlyph } from "@/components/marketing/ui";
import { Sky } from "@/components/sky";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="night grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="KinetixZero home">
            <Wordmark size={16} />
          </Link>
          <Link
            href="/"
            className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-[13px] transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to site
          </Link>
        </div>
        <main className="flex flex-1 items-center justify-center py-12">
          {/* Roomier controls on the sign-in surface; the forms themselves are shared logic. */}
          <div className="w-full max-w-[400px] [&_button[type=submit]]:h-11 [&_input:not([type=checkbox])]:h-11 [&_input:not([type=checkbox])]:rounded-lg [&_input:not([type=checkbox])]:px-3.5 [&_label]:text-[13px]">
            {children}
          </div>
        </main>
        <p className="eyebrow text-muted text-[10.5px]">
          Read-only · Human in the loop · Authorized targets only
        </p>
      </div>
      <BrandPanel />
    </div>
  );
}

function BrandPanel() {
  const points = [
    "Evidence-cited AI validation you can verify line by line",
    "Read-only static analysis — no live system is ever attacked",
    "CVE 5.1, OSV and PDF disclosure packages with chain of custody",
  ];
  return (
    <div
      aria-hidden
      className="border-rule relative hidden overflow-hidden border-l bg-black lg:flex lg:flex-col"
    >
      <Sky />
      <div className="relative flex flex-1 flex-col justify-center px-14 pb-40">
        <span className="border-rule-strong mb-8 grid size-14 place-items-center rounded-2xl border bg-black/60">
          <LogoMark size={30} />
        </span>
        <p className="eyebrow text-muted">KinetixZero platform</p>
        <h2 className="display text-ink mt-5 max-w-[15ch] text-[clamp(38px,3.6vw,56px)]">
          Find the paths attackers would take.
        </h2>
        <ul className="mt-10 flex flex-col gap-4">
          {points.map((text, i) => (
            <li key={text} className="text-ink/80 flex items-center gap-3.5 text-[15px]">
              <span className="border-rule-strong grid size-8 shrink-0 place-items-center rounded-full border">
                <DotGlyph variant={(i % 4) as 0 | 1 | 2} className="size-3.5" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
