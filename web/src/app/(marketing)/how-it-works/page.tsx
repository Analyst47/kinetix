import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { Container, DotGlyph, PageHero, Section } from "@/components/marketing/ui";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The KinetixZero workflow: define authorized scope, analyze code and dependencies, validate with an AI pass, and disclose responsibly.",
};

const STEPS: { n: string; title: string; body: string; detail: string[] }[] = [
  {
    n: "01",
    title: "Define authorized scope",
    body: "Everything starts with permission. You create a project, choose an authorization type, and attest to it.",
    detail: [
      "Set in-scope and out-of-scope boundaries for the engagement.",
      "The attestation is recorded with who attested and when.",
      "Scope travels with every finding and export for that project.",
    ],
  },
  {
    n: "02",
    title: "Analyze code & dependencies",
    body: "Point KinetixZero at a Git repository or upload a source archive. It runs the analyzers read-only and records a scan.",
    detail: [
      "SAST with taint tracking across JavaScript, TypeScript and Python.",
      "Dependency resolution matched against OSV advisories.",
      "Redacted secret detection, with results surfaced by confidence.",
    ],
  },
  {
    n: "03",
    title: "Validate with the AI pass",
    body: "Triage ranks the open findings. The AI layer assesses each one and shows cited evidence — you keep the verdict.",
    detail: [
      "Reachability is broken into controlled / reaches-sink / sanitized.",
      "Citations are verified against the exact code the model was shown.",
      "You confirm what's real and reproduce it; the AI never claims proof.",
    ],
  },
  {
    n: "04",
    title: "Disclose responsibly",
    body: "Confirmed findings become a disclosure package, tracked to a deadline with a verifiable trail.",
    detail: [
      "Generate CVE 5.1, OSV, and PDF outputs from the finding's fields.",
      "Track vendor notification, acknowledgement, and fix to a deadline.",
      "A hash-chained audit log keeps the whole history auditable.",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="Authorized scope in, filed disclosure out"
        lede="KinetixZero mirrors how careful research actually runs — four stages, with a human in the loop at the decisions that matter."
      />

      <Section className="pt-0 sm:pt-0">
        <Container>
          <ol className="border-rule border-t">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="border-rule grid gap-6 border-b py-10 lg:grid-cols-[120px_0.9fr_1fr] lg:items-start lg:gap-10"
              >
                <span className="display text-muted text-[44px] leading-none">{s.n}</span>
                <div>
                  <h2 className="display text-ink text-[clamp(24px,2.6vw,32px)]">{s.title}</h2>
                  <p className="text-muted mt-3 text-[15px] leading-[24px]">{s.body}</p>
                </div>
                <ul className="flex flex-col gap-3">
                  {s.detail.map((d, i) => (
                    <li key={d} className="text-ink/85 flex gap-3 text-[14.5px] leading-[22px]">
                      <DotGlyph variant={(i % 4) as 0 | 1 | 2 | 3} className="text-muted mt-[4px] size-3.5" />
                      {d}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section className="border-rule border-t">
        <Container className="flex flex-col items-start gap-6">
          <h2 className="display text-ink text-[clamp(30px,4.4vw,54px)]">
            See the workflow on your own repo
          </h2>
          <ButtonLink href="/register" variant="primary" className="h-12 px-6 text-[15px]">
            Get started free <ArrowRight />
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
