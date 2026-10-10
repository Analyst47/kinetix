import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { ProductDemo } from "@/components/marketing/product-demo";
import { Container, DotGlyph, PageHero, Section, SectionHeading } from "@/components/marketing/ui";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Product",
  description:
    "How KinetixZero analyzes code and dependencies, validates findings with cited evidence, and produces responsible-disclosure packages.",
};

const GROUPS = [
  {
    eyebrow: "Analysis",
    title: "See everything, ranked by confidence",
    points: [
      "Semgrep taint-mode rules trace untrusted input to dangerous sinks across JS/TS and Python.",
      "Dependency lockfiles resolve against the OSV database with version and fix mapping.",
      "Redacted secret detection flags exposed credential patterns without storing the secret.",
      "Every finding is marked Firm (taint-verified or matched CVE) or Tentative (pattern match).",
    ],
  },
  {
    eyebrow: "Validation",
    title: "An AI pass that shows its work",
    points: [
      "Claude assesses whether input is controlled, reaches the sink, and is sanitized.",
      "Each answer must cite exact lines; KinetixZero verifies citations against the code shown.",
      "The verdict is derived server-side — uncited definitive claims are downgraded to unclear.",
      "Batch triage ranks open findings so you work the most promising ones first.",
    ],
  },
  {
    eyebrow: "Disclosure",
    title: "From confirmed finding to filed report",
    points: [
      "Export CVE Record Format 5.1 and OSV JSON generated from real finding fields.",
      "Generate a professional PDF report with reproduction, impact, and remediation.",
      "Track the vendor timeline to a disclosure deadline with health indicators.",
      "A hash-chained audit log and evidence hashes make the whole trail verifiable.",
    ],
  },
];

const EXTRAS = [
  {
    title: "Reachability-aware",
    body: "Code and dependency findings carry the context needed to judge whether the vulnerable path is actually reachable.",
  },
  {
    title: "Standards-first",
    body: "Outputs follow CVE 5.1 and OSV so your findings slot into the ecosystems that consume them.",
  },
  {
    title: "Managed, metered AI",
    body: "AI runs on KinetixZero's own Claude integration — no key to manage. Every account includes 10 free AI searches, and usage is visible in the app.",
  },
];

export default function ProductPage() {
  return (
    <>
      <PageHero
        eyebrow="Product"
        title="The work that happens after discovery"
        lede="KinetixZero is organized around analysis, validation and disclosure, so a scan becomes a defensible, reproducible result."
      />

      <Section className="pt-0 sm:pt-0">
        <Container>
          <ProductDemo />
          <p className="text-muted mt-3 font-mono text-[11px] tracking-[0.12em] uppercase">
            Illustrative sample data
          </p>
        </Container>
      </Section>

      {GROUPS.map((g, gi) => (
        <Section key={g.eyebrow} className="border-rule border-t py-16 sm:py-20">
          <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <SectionHeading eyebrow={`0${gi + 1} · ${g.eyebrow}`} title={g.title} />
            <ul className="border-rule grid border-t sm:grid-cols-2">
              {g.points.map((p, i) => (
                <li
                  key={p}
                  className={`border-rule flex gap-3 border-b py-5 text-[14.5px] leading-[23px] sm:pr-6 ${i % 2 === 1 ? "sm:border-l sm:pl-6" : ""}`}
                >
                  <DotGlyph variant={(i % 4) as 0 | 1 | 2 | 3} className="text-muted mt-[4px] size-3.5" />
                  <span className="text-ink/85">{p}</span>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      ))}

      <Section className="border-rule border-t">
        <Container className="grid gap-4 sm:grid-cols-3">
          {EXTRAS.map((c, i) => (
            <div
              key={c.title}
              className="border-rule bg-raised/40 flex flex-col gap-4 rounded-3xl border p-6"
            >
              <span className="border-rule-strong text-ink grid size-10 place-items-center rounded-full border">
                <DotGlyph variant={(i + 1) as 1 | 2 | 3} />
              </span>
              <h3 className="text-ink text-[17px] font-semibold">{c.title}</h3>
              <p className="text-muted text-[14px] leading-[22px]">{c.body}</p>
            </div>
          ))}
        </Container>
      </Section>

      <Section className="border-rule border-t">
        <Container className="flex flex-col items-start gap-6">
          <h2 className="display text-ink text-[clamp(30px,4.4vw,54px)]">Ready to run an assessment?</h2>
          <ButtonLink href="/register" variant="primary" className="h-12 px-6 text-[15px]">
            Get started free <ArrowRight />
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
