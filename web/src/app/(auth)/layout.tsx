import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuthBrand } from "@/components/auth/brand";
import { CapsLockHint } from "@/components/auth/caps-lock";
import { AuthScene } from "@/components/auth/scene";
import { TraceScene } from "@/components/auth/trace-scene";
import { TrustChips } from "@/components/auth/trust";
import { StarField } from "@/components/sky";
import { TRIAGE_NAME } from "@/lib/format";

// Roomier, crafted controls on the sign-in surface. The forms themselves are shared logic and
// stay untouched; they are skinned from here. (Classes are spelled out in full so Tailwind sees them.)
const FORM_SKIN = [
  "[&_input:not([type=checkbox])]:h-11 [&_input:not([type=checkbox])]:rounded-lg",
  "[&_input:not([type=checkbox])]:px-3.5 [&_input:not([type=checkbox])]:text-[14.5px]",
  "[&_input:not([type=checkbox])]:border-rule-strong/80 [&_input:not([type=checkbox])]:bg-black/50",
  "[&_input:not([type=checkbox])]:transition-[border-color,background-color,box-shadow]",
  "[&_input:not([type=checkbox])]:duration-200",
  "[&_input:not([type=checkbox]):hover]:border-ink/40",
  "[&_input:not([type=checkbox]):focus-visible]:border-ink/85",
  "[&_input:not([type=checkbox]):focus-visible]:bg-black/80",
  "[&_input:not([type=checkbox]):focus-visible]:shadow-[0_0_0_4px_rgb(255_255_255/0.07)]",
  // One-time codes read better large and spaced.
  "[&_input[autocomplete=one-time-code]:not([type=checkbox])]:text-[17px]",
  "[&_input[autocomplete=one-time-code]:not([type=checkbox])]:tracking-[0.32em]",
  "[&_label]:text-ink/90 [&_label]:text-[13px]",
  "[&_button[type=submit]]:h-11 [&_button[type=submit]]:text-[14.5px] [&_button[type=submit]]:font-semibold",
  // Full-width actions (accept an invitation, get a new link) match the submit buttons.
  "[&_a.w-full]:h-11 [&_a.w-full]:text-[14.5px] [&_button.w-full]:h-11 [&_button.w-full]:text-[14.5px]",
  // A brief monochrome sheen across the primary action on hover.
  "[&_button[type=submit]:enabled:hover]:bg-[linear-gradient(110deg,var(--brand)_38%,#cfcfd4_50%,var(--brand)_62%)]",
  "[&_button[type=submit]:enabled:hover]:bg-[length:250%_100%]",
  "[&_button[type=submit]:enabled:hover]:opacity-100",
  "[&_button[type=submit]:enabled:hover]:animate-[kx-shimmer_2.4s_ease-in-out_infinite_reverse]",
].join(" ");

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="night grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative isolate flex min-w-0 flex-col px-5 py-5 sm:px-10 sm:py-7 xl:px-14">
        {/* The sky continues faintly behind the header, fading out before the form. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] overflow-hidden opacity-80"
          style={{
            maskImage: "linear-gradient(to bottom, #000 0%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 100%)",
          }}
        >
          <StarField density={0.35} />
        </div>

        <header className="kx-fade-up flex items-center justify-between gap-4">
          <AuthBrand />
          <Link
            href="/"
            className="group border-rule text-muted hover:border-rule-strong hover:text-ink inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors"
          >
            <ArrowLeft
              aria-hidden
              className="size-3.5 transition-transform duration-300 group-hover:-translate-x-0.5"
            />
            Back<span className="max-sm:hidden"> to site</span>
          </Link>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center py-9 sm:py-12">
          <div className="w-full max-w-[440px]">
            <div className="kx-fade-up relative" style={{ animationDelay: "90ms" }}>
              <CornerMarks />
              <div
                className={`border-rule bg-raised/70 relative rounded-2xl border p-6 backdrop-blur-sm sm:p-8 ${FORM_SKIN}`}
              >
                {/* A hairline of light travelling along the top edge. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-8 -top-px h-px animate-[kx-shimmer_7s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.6),transparent)] bg-[length:60%_100%] bg-center bg-no-repeat"
                />
                {children}
                <CapsLockHint />
              </div>
            </div>
            <TrustChips className="mt-6 px-1" />
          </div>
        </main>

        <footer className="text-muted flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="eyebrow text-[10px]">Read-only · Human in the loop · Authorized targets only</p>
          <nav aria-label="About KinetixZero" className="flex gap-4 text-[12.5px]">
            <Link href="/security" className="hover:text-ink transition-colors">
              Security
            </Link>
            <Link href="/how-it-works" className="hover:text-ink transition-colors">
              How it works
            </Link>
          </nav>
        </footer>
      </div>
      <BrandPanel />
    </div>
  );
}

/** Viewfinder corners framing the form. */
function CornerMarks() {
  const corner = "border-rule-strong absolute size-3.5";
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-2.5 max-sm:hidden">
      <span className={`${corner} top-0 left-0 border-t border-l`} />
      <span className={`${corner} top-0 right-0 border-t border-r`} />
      <span className={`${corner} bottom-0 left-0 border-b border-l`} />
      <span className={`${corner} right-0 bottom-0 border-r border-b`} />
    </div>
  );
}

function BrandPanel() {
  return (
    <aside
      aria-label="How KinetixZero reads code, an illustrative example"
      className="border-rule relative hidden border-l bg-black lg:sticky lg:top-0 lg:flex lg:h-dvh lg:min-h-[660px] lg:flex-col"
    >
      <AuthScene
        className="flex flex-1 flex-col"
        contentClassName="px-10 py-8 xl:px-14 xl:py-10 [@media(max-height:760px)]:py-6"
      >
        <div className="kx-fade-up flex items-center gap-3">
          <span className="eyebrow text-muted text-[10.5px]">Inside KinetixZero</span>
          <span className="border-rule-strong text-muted inline-flex h-5 items-center rounded-full border px-2 font-mono text-[9.5px] tracking-[0.14em] uppercase">
            Illustrative
          </span>
        </div>

        <div className="mt-10 flex flex-col gap-4 xl:mt-14 [@media(max-height:760px)]:mt-6">
          <h2 className="display text-ink text-[clamp(28px,2.6vw,46px)] [@media(max-height:760px)]:text-[30px]">
            {["Trace the input.", "Cite the evidence.", "You make the call."].map((line, i) => (
              <span
                key={line}
                className={`kx-fade-up block ${i === 2 ? "text-muted" : ""}`}
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                {line}
              </span>
            ))}
          </h2>
          <p
            className="kx-fade-up text-muted max-w-[30ch] text-[14.5px] leading-[22px] xl:max-w-[36ch] [@media(max-height:860px)]:hidden"
            style={{ animationDelay: "420ms" }}
          >
            Static analysis finds the path. {TRIAGE_NAME} answers with cited lines. Nothing is confirmed until
            a researcher says so.
          </p>
        </div>

        <div className="kx-fade-up mt-auto w-full max-w-[620px] pt-8" style={{ animationDelay: "320ms" }}>
          <TraceScene />
        </div>
      </AuthScene>
    </aside>
  );
}
