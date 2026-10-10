import {
  ArrowRight,
  Check,
  FileCheck2,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Faq } from "@/components/marketing/faq";
import {
  AttackAnalysisCard,
  ConfirmCard,
  DisclosureCard,
  FindingsCard,
  MiniAnalyze,
  MiniDisclose,
  MiniValidate,
  RemediationCard,
} from "@/components/marketing/product-mockups";
import { Container, Eyebrow, Section, SectionHeading } from "@/components/marketing/ui";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "KinetixZero — Find the paths attackers would take",
  description:
    "AI-assisted application security: analyze code and dependencies, validate findings with cited evidence, and ship responsible-disclosure packages.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <Methodology />
      <Features />
      <Plans />
      <FaqSection />
      <ClosingCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
      <div aria-hidden className="halo pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
      <Container className="relative grid items-center gap-14 pt-14 pb-20 lg:grid-cols-[1.02fr_1fr] lg:pt-20 lg:pb-28">
        <div className="flex flex-col items-start gap-6">
          <span className="border-rule bg-raised/60 text-muted inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-medium">
            <Sparkles className="text-signal size-3.5" />
            AI-assisted vulnerability research
          </span>
          <h1 className="display text-ink text-[clamp(38px,6vw,70px)]">
            Find the paths attackers would take.{" "}
            <span className="text-signal">Fix them first.</span>
          </h1>
          <p className="text-muted max-w-[54ch] text-[clamp(17px,1.35vw,20px)] leading-[1.5]">
            KinetixZero reads your source and dependencies, traces how untrusted input reaches a
            dangerous sink, and backs every finding with cited evidence — so you spend your time on
            the issues that are actually real.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/register" variant="primary" className="h-11 rounded-full px-5 text-[15px]">
              Request access <ArrowRight />
            </ButtonLink>
            <ButtonLink
              href="/how-it-works"
              variant="secondary"
              className="h-11 rounded-full px-5 text-[15px]"
            >
              See how it works
            </ButtonLink>
          </div>
          <ul className="text-muted mt-1 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
            <li className="flex items-center gap-2">
              <ShieldCheck className="text-vg size-4" /> Read-only, human-in-the-loop
            </li>
            <li className="flex items-center gap-2">
              <Check className="text-vg size-4" /> Bring your own AI key — free
            </li>
          </ul>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="bg-signal/10 absolute -inset-6 -z-10 rounded-[32px] blur-2xl"
          />
          <AttackAnalysisCard className="rotate-[0.6deg]" />
        </div>
      </Container>
    </section>
  );
}

function Methodology() {
  const steps = [
    {
      n: "01",
      icon: <ScanSearch className="size-4" />,
      title: "Analyze",
      body: "Scan code and dependencies — taint-tracked SAST, OSV advisories, exposed secrets.",
      visual: <MiniAnalyze />,
    },
    {
      n: "02",
      icon: <Sparkles className="size-4" />,
      title: "Validate",
      body: "An AI pass checks reachability with cited evidence; you keep the verdict.",
      visual: <MiniValidate />,
    },
    {
      n: "03",
      icon: <FileCheck2 className="size-4" />,
      title: "Disclose",
      body: "Turn confirmed findings into CVE, OSV and PDF packages with an auditable trail.",
      visual: <MiniDisclose />,
    },
  ];
  return (
    <Section className="border-rule/60 border-t py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="Three stages, one auditable trail"
          align="center"
          className="mx-auto"
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="border-rule bg-raised/50 flex flex-col gap-4 rounded-xl border p-5">
              <div className="flex items-center gap-2.5">
                <span className="border-rule bg-sunken text-signal grid size-8 place-items-center rounded-md border">
                  {s.icon}
                </span>
                <span className="text-ink text-[15px] font-semibold">{s.title}</span>
                <span className="text-signal/40 display ml-auto text-[22px]">{s.n}</span>
              </div>
              <p className="text-muted text-[13.5px] leading-[21px]">{s.body}</p>
              <div className="mt-auto">{s.visual}</div>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function FeatureRow({
  eyebrow,
  title,
  body,
  points,
  visual,
  flip,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "lg:order-2" : undefined}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="display text-ink mt-4 text-[clamp(24px,3vw,36px)]">{title}</h3>
        <p className="text-muted mt-4 max-w-[48ch] text-[15.5px] leading-[25px]">{body}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {points.map((p) => (
            <li key={p} className="text-ink flex gap-3 text-[14px] leading-[22px]">
              <FileCheck2 className="text-vg mt-0.5 size-4 shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? "lg:order-1" : undefined}>{visual}</div>
    </div>
  );
}

function Features() {
  return (
    <Section id="product" className="border-rule/60 flex flex-col gap-24 border-t sm:gap-32">
      <Container>
        <FeatureRow
          eyebrow="Signal over noise"
          title="Separate real bugs from the pile"
          body="Scanners hand you hundreds of alerts. KinetixZero ranks them: Firm for taint-verified paths and matched CVEs, Tentative for pattern matches — and an AI verdict on each."
          points={[
            "Confidence levels put taint-verified paths first.",
            "AI verdicts flag what's likely real vs. a false positive.",
            "Filter and triage a ranked shortlist, not a wall of findings.",
          ]}
          visual={<FindingsCard className="rotate-[-0.6deg]" />}
        />
      </Container>
      <Container>
        <FeatureRow
          flip
          eyebrow="Evidence, not guesswork"
          title="Trace the path from input to sink"
          body="For each finding, the AI layer answers whether input is attacker-controlled, reaches the sink, and is sanitized — and cites exact lines. KinetixZero verifies every citation and derives the verdict itself."
          points={[
            "A source-to-sink data-flow view you can audit.",
            "Uncited claims are downgraded, never treated as proof.",
            "Reproduction notes you can run yourself to confirm.",
          ]}
          visual={<AttackAnalysisCard className="rotate-[0.5deg]" />}
        />
      </Container>
      <Container>
        <FeatureRow
          eyebrow="Human in the loop"
          title="You stay in control"
          body="KinetixZero produces hypotheses with evidence — it never confirms a vulnerability for you, launches attacks, or contacts anyone. You review, reproduce, and record the verdict."
          points={[
            "No autonomous exploitation of live systems.",
            "Every AI run is advisory and recorded in the chain of custody.",
            "You decide: real, false positive, or needs more work.",
          ]}
          visual={<ConfirmCard className="rotate-[-0.5deg]" />}
        />
      </Container>
      <Container>
        <FeatureRow
          flip
          eyebrow="From finding to fix"
          title="Draft the fix, then the disclosure"
          body="KinetixZero drafts CWE-mapped remediation and assembles a responsible-disclosure package — CVE 5.1, OSV and a PDF report — with evidence and chain-of-custody hashes. You apply and file."
          points={[
            "Suggested patches you review before applying.",
            "Standards-based exports ready to submit.",
            "Vendor timeline tracked to a disclosure deadline.",
          ]}
          visual={
            <div className="flex flex-col gap-4">
              <RemediationCard className="rotate-[0.5deg]" />
              <DisclosureCard className="rotate-[-0.4deg]" />
            </div>
          }
        />
      </Container>
    </Section>
  );
}

function Plans() {
  const plans = [
    {
      name: "Bring your own key",
      price: "Free",
      sub: "Available now",
      highlight: true,
      body: "Run the full platform with your own Anthropic or Gemini key. AI calls bill to your provider, never to KinetixZero.",
      features: [
        "Full assessment workflow",
        "SAST, dependency & secret scanning",
        "AI validation with your own key",
        "CVE / OSV / PDF exports",
      ],
      cta: { label: "Request access", href: "/register", variant: "primary" as const },
    },
    {
      name: "Built-in AI",
      price: "Coming soon",
      sub: "Pay-as-you-go",
      body: "Managed, metered AI with no key to bring. Rolling out once billing is in place.",
      features: [
        "Everything in Bring your own key",
        "No API key to manage",
        "Usage-based, with spend caps",
        "Same evidence-cited validation",
      ],
      cta: { label: "Notify me", href: "/register", variant: "secondary" as const },
    },
    {
      name: "Team",
      price: "Let's talk",
      sub: "For research teams",
      body: "Shared workspaces, roles and review workflows for consultants and security teams.",
      features: [
        "Multiple researchers & roles",
        "Shared findings & disclosures",
        "Audit log & chain of custody",
        "Priority support",
      ],
      cta: { label: "Get in touch", href: "/register", variant: "secondary" as const },
    },
  ];
  return (
    <Section id="plans" className="border-rule/60 border-t">
      <Container>
        <SectionHeading
          eyebrow="Plans"
          title="Free to run while in early access"
          lede="No fabricated prices and no checkout yet. Bring your own key today; managed billing is on the way."
          align="center"
          className="mx-auto"
        />
        <div className="mt-12 grid items-start gap-5 lg:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={
                p.highlight
                  ? "border-signal/30 from-signal/[0.07] rounded-2xl border bg-gradient-to-b to-transparent p-6"
                  : "border-rule bg-raised/50 rounded-2xl border p-6"
              }
            >
              <div className="flex items-center justify-between">
                <h3 className="text-ink text-[16px] font-semibold">{p.name}</h3>
                {p.highlight ? (
                  <span className="border-signal/30 bg-signal/10 text-signal rounded-full border px-2 py-0.5 text-[10.5px] font-medium tracking-wide uppercase">
                    {p.sub}
                  </span>
                ) : (
                  <span className="text-muted text-[11.5px]">{p.sub}</span>
                )}
              </div>
              <p className="display text-ink mt-4 text-[32px]">{p.price}</p>
              <p className="text-muted mt-3 min-h-[42px] text-[13.5px] leading-[21px]">{p.body}</p>
              <ButtonLink
                href={p.cta.href}
                variant={p.cta.variant}
                className="mt-5 h-10 w-full rounded-full"
              >
                {p.cta.label}
              </ButtonLink>
              <ul className="mt-6 flex flex-col gap-2.5 border-t border-dashed border-current/10 pt-5">
                {p.features.map((f) => (
                  <li key={f} className="text-ink flex items-center gap-2.5 text-[13.5px]">
                    <Check className="text-vg size-4 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-muted mt-6 flex items-center justify-center gap-2 text-center text-[13px]">
          <UserCheck className="text-vg size-4" />
          Every workspace records an authorization attestation. KinetixZero is for targets you&apos;re
          allowed to analyze.
        </p>
      </Container>
    </Section>
  );
}

function FaqSection() {
  return (
    <Section id="faq" className="border-rule/60 border-t">
      <Container className="max-w-4xl">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered honestly"
          align="center"
          className="mx-auto"
        />
        <div className="mt-10">
          <Faq />
        </div>
      </Container>
    </Section>
  );
}

function ClosingCta() {
  return (
    <Section className="border-rule/60 border-t">
      <Container>
        <div className="border-signal/20 from-signal/[0.06] relative overflow-hidden rounded-3xl border bg-gradient-to-b to-transparent px-6 py-16 text-center sm:px-12">
          <div aria-hidden className="halo pointer-events-none absolute inset-x-0 top-0 h-40" />
          <div className="relative flex flex-col items-center gap-6">
            <h2 className="display text-ink text-[clamp(30px,4.6vw,52px)]">
              Stop triaging noise. <span className="text-signal">Start finding real paths.</span>
            </h2>
            <p className="text-muted max-w-[52ch] text-[17px] leading-[27px]">
              Bring a repository you&apos;re authorized to test and see what an evidence-backed
              assessment looks like.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/register" variant="primary" className="h-11 rounded-full px-6 text-[15px]">
                Request access <ArrowRight />
              </ButtonLink>
              <Link
                href="/product"
                className="text-muted hover:text-ink inline-flex h-11 items-center px-4 text-[15px] font-medium"
              >
                Explore the product
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
