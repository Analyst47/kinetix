import Link from "next/link";

import { Wordmark } from "@/components/logo";
import { Horizon, StarField } from "@/components/sky";

import { Container } from "./ui";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Capabilities" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/#radar", label: "Attack-surface radar" },
      { href: "/#pricing", label: "Pricing" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security" },
      { href: "/security#responsible-use", label: "Responsible use" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/register", label: "Get started" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-rule relative overflow-hidden border-t">
      <Container className="relative grid gap-10 pt-16 pb-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Wordmark size={17} />
          <p className="text-muted max-w-[36ch] text-[14px] leading-[22px]">
            AI-assisted application security for authorized vulnerability research and responsible disclosure.
            Read-only. Human in the loop.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-3">
            <h3 className="eyebrow text-muted">{col.title}</h3>
            <ul className="flex flex-col gap-2.5">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-ink/80 hover:text-ink text-[14px] transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>

      {/* The large wordmark, rising out of the horizon and fading into it. */}
      <div aria-hidden className="relative h-[clamp(96px,15vw,240px)] overflow-hidden select-none">
        <StarField density={0.35} />
        <Horizon className="h-full opacity-70" />
        <p className="wordmark-giant absolute inset-x-0 bottom-[-0.18em] z-10 text-center text-[clamp(64px,15.5vw,250px)] whitespace-nowrap">
          KinetixZero
        </p>
      </div>

      <div className="border-rule relative border-t bg-black">
        <Container className="text-muted flex flex-col items-start justify-between gap-2 py-6 text-[12.5px] sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} KinetixZero. All rights reserved.</p>
          <p>For targets you are authorized to analyze. No live systems are attacked.</p>
        </Container>
      </div>
    </footer>
  );
}
