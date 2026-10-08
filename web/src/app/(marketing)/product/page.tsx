import { ArrowRight, Boxes, FileCheck2, KeyRound, Radar, ScanSearch, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { ProductDemo } from "@/components/marketing/product-demo";
import { Card, Container, Section, SectionHeading } from "@/components/marketing/ui";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Product",
  description:
    "How Kinetix analyzes code and dependencies, validates findings with cited evidence, and produces responsible-disclosure packages.",
};

const GROUPS = [
  {
    eyebrow: "Analysis",
    icon: <ScanSearch className="size-5" />,
    title: "See everything, surfaced by confidence",
    points: [
      "Semgrep taint-mode rules trace untrusted input to dangerous sinks across JS/TS and Python.",
      "Dependency lockfiles resolve against the OSV database with version and fix mapping.",
      "Redacted secret detection flags exposed credential patterns without storing the secret.",
      "Every finding is marked Firm (taint-verified or matched CVE) or Tentative (pattern match).",
    ],
  },
  {
    eyebrow: "Validation",
    icon: <Sparkles className="size-5" />,
    title: "An AI pass that shows its work",
    points: [
      "The model assesses whether input is controlled, reaches the sink, and is sanitized.",
      "Each answer must cite exact lines; Kinetix verifies citations against the code shown.",
      "The verdict is derived server-side — uncited definitive claims are downgraded to unclear.",
      "Batch triage ranks open findings so you work the most promising ones first.",
    ],
  },
  {
    eyebrow: "Disclosure",
    icon: <FileCheck2 className="size-5" />,
    title: "From confirmed finding to filed report",
    points: [
      "Export CVE Record Format 5.1 and OSV JSON generated from real finding fields.",
      "Generate a professional PDF report with reproduction, impact, and remediation.",
      "Track the vendor timeline to a disclosure deadline with health indicators.",
      "A hash-chained audit log and evidence hashes make the whole trail verifiable.",
    ],
  },
];

export default function ProductPage() {
  return (
    <>
      <Section className="pb-10">
        <Container className="flex flex-col items-center gap-6 text-center">
          <SectionHeading
            eyebrow="Product"
            title="The work that happens after discovery"
            lede="Kinetix is organized around three stages — analysis, validation, and disclosure — so a scan becomes a defensible result."
            align="center"
            className="mx-auto"
          />
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <ProductDemo />
        </Container>
      </Section>

      {GROUPS.map((g) => (
        <Section key={g.eyebrow} className="border-rule/60 border-t py-16">
          <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <span className="border-rule bg-sunken text-signal grid size-10 place-items-center rounded-md border">
                {g.icon}
              </span>
              <SectionHeading eyebrow={g.eyebrow} title={g.title} className="mt-5" />
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {g.points.map((p) => (
                <Card key={p} className="p-5">
                  <p className="text-ink flex gap-3 text-[14px] leading-[22px]">
                    <FileCheck2 className="text-vg mt-0.5 size-4 shrink-0" />
                    {p}
                  </p>
                </Card>
              ))}
            </ul>
          </Container>
        </Section>
      ))}

      <Section className="border-rule/60 border-t">
        <Container className="grid gap-5 sm:grid-cols-3">
          <Card>
            <Radar className="text-signal size-5" />
            <h3 className="text-ink mt-3 font-semibold">Reachability-aware</h3>
            <p className="text-muted mt-2 text-[13.5px] leading-[21px]">
              Dependency and code findings carry the context needed to judge whether the vulnerable
              path is actually reachable.
            </p>
          </Card>
          <Card>
            <Boxes className="text-signal size-5" />
            <h3 className="text-ink mt-3 font-semibold">Standards-first</h3>
            <p className="text-muted mt-2 text-[13.5px] leading-[21px]">
              Outputs follow CVE 5.1 and OSV so your findings slot into the ecosystems that consume
              them.
            </p>
          </Card>
          <Card>
            <KeyRound className="text-signal size-5" />
            <h3 className="text-ink mt-3 font-semibold">Your own AI key</h3>
            <p className="text-muted mt-2 text-[13.5px] leading-[21px]">
              Bring your paid Claude API account; requests bill to you, and the integration fails
              loudly if a key is missing rather than switching silently.
            </p>
          </Card>
        </Container>
      </Section>

      <Section className="border-rule/60 border-t">
        <Container className="flex flex-col items-center gap-5 text-center">
          <h2 className="display text-ink text-[clamp(26px,3.6vw,40px)]">Ready to run an assessment?</h2>
          <ButtonLink href="/register" variant="primary" className="h-11 px-6 text-[15px]">
            Request access <ArrowRight />
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
