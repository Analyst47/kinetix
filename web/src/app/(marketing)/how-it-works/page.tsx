import { ArrowRight, FileCheck2, ScanSearch, Sparkles, Target } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Container, Section, SectionHeading } from "@/components/marketing/ui";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The KinetixZero execution model: define authorized scope, analyze code and dependencies, validate with an AI pass, and disclose responsibly.",
};

const STEPS: { n: string; icon: ReactNode; title: string; body: string; detail: string[] }[] = [
  {
    n: "01",
    icon: <Target className="size-5" />,
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
    icon: <ScanSearch className="size-5" />,
    title: "Analyze code & dependencies",
    body: "Point KinetixZero at a Git repository or upload a source archive. It runs the analyzers and records a scan.",
    detail: [
      "SAST with taint tracking across JavaScript, TypeScript and Python.",
      "Dependency resolution matched against OSV advisories.",
      "Redacted secret detection, with results surfaced by confidence.",
    ],
  },
  {
    n: "03",
    icon: <Sparkles className="size-5" />,
    title: "Validate with the AI pass",
    body: "Triage ranks the open findings. The optional AI layer assesses each one and shows cited evidence — you keep the verdict.",
    detail: [
      "Reachability is broken into controlled / reaches-sink / sanitized.",
      "Citations are verified against the exact code the model was shown.",
      "You confirm what's real and reproduce it; the AI never claims proof.",
    ],
  },
  {
    n: "04",
    icon: <FileCheck2 className="size-5" />,
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
      <Section className="pb-8">
        <Container className="flex flex-col items-center gap-6 text-center">
          <SectionHeading
            eyebrow="How it works"
            title="Authorized scope in, filed disclosure out"
            lede="KinetixZero mirrors how careful research actually runs — four stages, with a human in the loop at the decisions that matter."
            align="center"
            className="mx-auto"
          />
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <div className="flex flex-col gap-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="border-rule bg-raised/60 grid gap-6 rounded-xl border p-6 sm:p-8 lg:grid-cols-[auto_0.8fr_1fr] lg:items-start"
              >
                <div className="flex items-center gap-4 lg:flex-col lg:items-start">
                  <span className="display text-signal/40 text-[34px] leading-none">{s.n}</span>
                  <span className="border-rule bg-sunken text-signal grid size-11 place-items-center rounded-md border">
                    {s.icon}
                  </span>
                </div>
                <div>
                  <h3 className="text-ink text-[19px] font-semibold tracking-[-0.01em]">{s.title}</h3>
                  <p className="text-muted mt-2 text-[14.5px] leading-[23px]">{s.body}</p>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {s.detail.map((d) => (
                    <li key={d} className="text-ink flex gap-3 text-[13.5px] leading-[21px]">
                      <FileCheck2 className="text-vg mt-0.5 size-4 shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="border-rule/60 border-t">
        <Container className="flex flex-col items-center gap-5 text-center">
          <h2 className="display text-ink text-[clamp(26px,3.6vw,40px)]">
            See the workflow on your own repo
          </h2>
          <ButtonLink href="/register" variant="primary" className="h-11 px-6 text-[15px]">
            Request access <ArrowRight />
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
