import Link from "next/link";

import { Wordmark } from "@/components/logo";

import { Container } from "./ui";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Capabilities" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/#plans", label: "Plans" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security & authorization" },
      { href: "/security#responsible-use", label: "Responsible use" },
    ],
  },
  {
    title: "Access",
    links: [
      { href: "/register", label: "Request access" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-rule/70 border-t">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Wordmark size={17} />
          <p className="text-muted max-w-[34ch] text-[13.5px] leading-[21px]">
            An AI-assisted application security platform for authorized vulnerability research and
            responsible disclosure.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-3">
            <h3 className="text-ink text-[13px] font-semibold">{col.title}</h3>
            <ul className="flex flex-col gap-2">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link
                    href={l.href}
                    className="text-muted hover:text-ink text-[13.5px] transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-rule/70 border-t">
        <Container className="flex flex-col items-start justify-between gap-2 py-6 text-[12.5px] sm:flex-row sm:items-center">
          <p className="text-muted">© {new Date().getFullYear()} KinetixZero. All rights reserved.</p>
          <p className="text-muted">
            KinetixZero assists research only on targets you are authorized to analyze.
          </p>
        </Container>
      </div>
    </footer>
  );
}
