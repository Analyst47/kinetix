import {
  ArrowRight,
  Boxes,
  FileCheck2,
  GitBranch,
  Layers,
  ListChecks,
  Radar,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Faq } from "@/components/marketing/faq";
import { ProductDemo } from "@/components/marketing/product-demo";
import { Card, Container, Eyebrow, Section, SectionHeading } from "@/components/marketing/ui";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Kinetix — Find the paths attackers would take",
  description:
    "AI-assisted application security: analyze code and dependencies, validate findings with cited evidence, and ship responsible-disclosure packages.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProblemSolution />
      <Capabilities />
      <HowItWorks />
      <SecurityTrust />
      <Reports />
      <Audience />
      <Pricing />
      <FaqSection />
      <ClosingCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-[0.5]" />
      <div aria-hidden className="halo pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <Container className="relative grid gap-14 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-24 lg:pb-28">
        <div className="flex flex-col items-start gap-6">
          <span className="border-rule bg-raised/60 text-muted inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-medium">
            <Sparkles className="text-signal size-3.5" />
            AI-assisted vulnerability research
          </span>
          <h1 className="display text-ink text-[clamp(38px,6.4vw,72px)]">
            Find the paths attackers
            <br className="hidden sm:block" /> would take.{" "}
            <span className="text-signal">Fix them first.</span>
          </h1>
          <p className="text-muted max-w-[56ch] text-[clamp(17px,1.4vw,20px)] leading-[1.5]">
            Kinetix reads your source and dependencies, correlates what it finds with public
            vulnerability intelligence, and helps you validate and responsibly disclose the issues
            that are actually real — with evidence, not guesswork.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/register" variant="primary" className="h-11 px-5 text-[15px]">
              Request access
              <ArrowRight />
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" className="h-11 px-5 text-[15px]">
              See how it works
            </ButtonLink>
          </div>
          <ul className="text-muted mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
            <li className="flex items-center gap-2">
              <ShieldCheck className="text-vg size-4" /> Read-only, human-in-the-loop
            </li>
            <li className="flex items-center gap-2">
              <GitBranch className="text-vg size-4" /> Works on repos you&apos;re authorized to test
            </li>
          </ul>
        </div>

        <div id="demo" className="scroll-mt-24">
          <ProductDemo />
        </div>
      </Container>
    </section>
  );
}

function ProblemSolution() {
  const problems = [
    "Scanners bury a few real issues under hundreds of pattern matches.",
    "Confirming whether a finding is actually exploitable eats hours per issue.",
    "Dependency alerts rarely say whether the vulnerable code is even reachable.",
    "Turning a validated bug into a clean disclosure is slow, manual paperwork.",
  ];
  const solutions = [
    "Confidence levels separate taint-verified paths from pattern noise up front.",
    "An AI pass assesses reachability with cited evidence you can audit line by line.",
    "Dependency findings link the advisory to the manifest and the affected version.",
    "One-click CVE 5.1, OSV, and PDF packages with evidence and chain-of-custody.",
  ];
  return (
    <Section className="border-rule/60 border-t">
      <Container>
        <SectionHeading
          eyebrow="The gap"
          title="Discovery is easy. Deciding what's real is the hard part."
          lede="Most tools stop at a wall of alerts. Kinetix is built around the work that comes after — triage, validation, and disclosure."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Card className="border-crit/25">
            <h3 className="text-ink flex items-center gap-2 text-[15px] font-semibold">
              <span className="bg-crit size-2 rounded-full" /> Without Kinetix
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              {problems.map((p) => (
                <li key={p} className="text-muted flex gap-3 text-[14px] leading-[21px]">
                  <span className="text-crit/70 mt-2 h-px w-3 shrink-0 bg-current" />
                  {p}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="border-vg/30">
            <h3 className="text-ink flex items-center gap-2 text-[15px] font-semibold">
              <span className="bg-vg size-2 rounded-full" /> With Kinetix
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              {solutions.map((p) => (
                <li key={p} className="text-ink flex gap-3 text-[14px] leading-[21px]">
                  <FileCheck2 className="text-vg mt-0.5 size-4 shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Container>
    </Section>
  );
}

function Feature({
  icon,
  title,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <span className="border-rule bg-sunken text-signal grid size-10 place-items-center rounded-md border">
        {icon}
      </span>
      <h3 className="text-ink mt-4 text-[16px] font-semibold">{title}</h3>
      <p className="text-muted mt-2 text-[14px] leading-[22px]">{children}</p>
    </Card>
  );
}

function Capabilities() {
  return (
    <Section id="product" className="border-rule/60 border-t">
      <Container>
        <SectionHeading
          eyebrow="Capabilities"
          title="A full research workflow, not just a scanner"
          lede="Everything from the first scan to a disclosure package the vendor can act on."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {/* Wide highlighted feature */}
          <Card className="border-signal/25 from-signal/[0.06] flex flex-col justify-between gap-6 bg-gradient-to-br to-transparent lg:col-span-2 lg:flex-row lg:items-center">
            <div className="max-w-[46ch]">
              <Eyebrow>AI validation layer</Eyebrow>
              <h3 className="display text-ink mt-3 text-[26px]">
                Source-to-sink reasoning with evidence you can check
              </h3>
              <p className="text-muted mt-3 text-[14.5px] leading-[23px]">
                For each finding, the model answers three questions — is input attacker-controlled,
                does it reach the sink, is it sanitized — and cites exact lines. Kinetix verifies
                every citation against the code shown and derives the verdict itself, so an
                uncited claim never becomes a conclusion.
              </p>
            </div>
            <div className="border-rule bg-sunken/60 mono shrink-0 rounded-lg border p-4 text-[12px] leading-[20px] lg:w-[260px]">
              <p className="text-muted">input_controlled</p>
              <p className="text-ink">yes · req.query.name ✓</p>
              <p className="text-muted mt-2">reaches_sink</p>
              <p className="text-ink">yes · fs.readFile ✓</p>
              <p className="text-muted mt-2">sanitized</p>
              <p className="text-ink">no</p>
              <p className="text-signal border-rule mt-3 border-t pt-2">→ likely real · high</p>
            </div>
          </Card>

          <Feature icon={<ScanSearch className="size-5" />} title="Static analysis with taint tracking">
            A curated Semgrep rule pack traces untrusted input to dangerous sinks across JS/TS and
            Python — SSRF, injection, path traversal, SSTI and more.
          </Feature>
          <Feature icon={<Boxes className="size-5" />} title="Dependency intelligence">
            Lockfiles are resolved and matched against OSV advisories, linking each vulnerable
            package to its manifest, version, and fixed release.
          </Feature>
          <Feature icon={<Radar className="size-5" />} title="Confidence ranking">
            Findings are marked Firm or Tentative so you spend your attention on taint-verified
            paths and known CVEs first.
          </Feature>
          <Feature icon={<ListChecks className="size-5" />} title="Triage queue">
            Batch-analyze open findings and work a ranked shortlist, keeping the human verdict —
            real, false positive, or needs more context.
          </Feature>
          <Feature icon={<GitBranch className="size-5" />} title="Hardened repository fetch">
            Git targets are cloned over HTTPS with pinned IPs, no hooks, no submodules, and
            symlinks flattened — the target&apos;s code can&apos;t run on your box.
          </Feature>
          <Feature icon={<FileCheck2 className="size-5" />} title="Disclosure engine">
            Confirmed findings become CVE 5.1, OSV, and PDF packages with deadlines, evidence, and
            a verifiable chain of custody.
          </Feature>
        </div>
      </Container>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <Target className="size-5" />,
      title: "Define authorized scope",
      body: "Create a project, attest to your authorization, and set what's in and out of scope. Every assessment is tied to that record.",
    },
    {
      icon: <ScanSearch className="size-5" />,
      title: "Analyze code & dependencies",
      body: "Point Kinetix at a repository or upload. It runs SAST with taint tracking, resolves dependencies against OSV, and flags exposed secrets.",
    },
    {
      icon: <Sparkles className="size-5" />,
      title: "Validate with the AI pass",
      body: "Triage ranks what matters. The AI assesses reachability with cited evidence; you confirm what's real and reproduce it yourself.",
    },
    {
      icon: <FileCheck2 className="size-5" />,
      title: "Disclose responsibly",
      body: "Generate a CVE/OSV/PDF package, track the vendor timeline to deadline, and keep an auditable history end to end.",
    },
  ];
  return (
    <Section id="how" className="border-rule/60 border-t">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="From authorized scope to a filed disclosure"
          align="center"
          className="mx-auto"
        />
        <ol className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="border-rule bg-raised/60 relative rounded-lg border p-6">
              <span className="text-signal/40 display absolute top-4 right-5 text-[28px]">
                0{i + 1}
              </span>
              <span className="border-rule bg-sunken text-signal grid size-10 place-items-center rounded-md border">
                {s.icon}
              </span>
              <h3 className="text-ink mt-4 text-[15.5px] font-semibold">{s.title}</h3>
              <p className="text-muted mt-2 text-[13.5px] leading-[21px]">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

function SecurityTrust() {
  const items = [
    {
      icon: <ShieldCheck className="size-5" />,
      title: "Read-only by design",
      body: "Kinetix performs static analysis. It does not launch exploits or attacks against live systems — a human researcher validates and reproduces findings.",
    },
    {
      icon: <Target className="size-5" />,
      title: "Authorization on every project",
      body: "Each project captures an explicit authorization attestation and scope. The platform is for targets you have permission to analyze.",
    },
    {
      icon: <Layers className="size-5" />,
      title: "Tenant isolation",
      body: "Workspaces are isolated at the database layer with row-level security and a restricted application role, enforced in production by a startup guard.",
    },
    {
      icon: <FileCheck2 className="size-5" />,
      title: "Auditable by default",
      body: "Actions are recorded in a hash-chained audit log, and exports carry evidence and chain-of-custody hashes you can verify.",
    },
  ];
  return (
    <Section id="security" className="border-rule/60 border-t">
      <Container className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <SectionHeading
          eyebrow="Security & trust"
          title="Built for responsible, authorized research"
          lede="Safeguards are part of the product, not a policy page. Here's what's actually enforced."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          {items.map((it) => (
            <Card key={it.title}>
              <span className="text-signal">{it.icon}</span>
              <h3 className="text-ink mt-3 text-[15px] font-semibold">{it.title}</h3>
              <p className="text-muted mt-2 text-[13.5px] leading-[21px]">{it.body}</p>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function Reports() {
  return (
    <Section id="reports" className="border-rule/60 border-t">
      <Container>
        <SectionHeading
          eyebrow="Reports & results"
          title="Deliverables a vendor can act on"
          lede="A Kinetix assessment ends in artifacts, not a dashboard you have to transcribe."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            {
              k: "Standards-based exports",
              v: "CVE Record Format 5.1 and OSV JSON, generated from the finding's real fields — ready to submit.",
            },
            {
              k: "Professional PDF reports",
              v: "A server-generated report with severity, reproduction, impact, and remediation, consistent with the reporting engine.",
            },
            {
              k: "Labeled research dataset",
              v: "Export findings with features and ground-truth labels — useful for measuring and training your own tooling.",
            },
          ].map((c) => (
            <Card key={c.k}>
              <h3 className="text-ink text-[15px] font-semibold">{c.k}</h3>
              <p className="text-muted mt-2 text-[13.5px] leading-[21px]">{c.v}</p>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function Audience() {
  const rows = [
    {
      who: "Security researchers",
      why: "Work bug-bounty scope faster — spend time on the few findings most likely to be real and valuable.",
    },
    {
      who: "AppSec engineers",
      why: "Bring code and dependency findings into one validated, ranked view with reproducible evidence.",
    },
    {
      who: "Consultants",
      why: "Standardize assessment-to-report so every engagement ends in a clean, defensible package.",
    },
    {
      who: "Engineering teams",
      why: "Understand which alerts are reachable and worth fixing — before they ship, not after.",
    },
  ];
  return (
    <Section className="border-rule/60 border-t">
      <Container>
        <SectionHeading eyebrow="Who it's for" title="One workflow, several seats" />
        <div className="divide-rule border-rule mt-10 divide-y rounded-lg border">
          {rows.map((r) => (
            <div key={r.who} className="grid gap-2 px-6 py-5 sm:grid-cols-[0.5fr_1fr] sm:items-center">
              <p className="text-ink text-[15px] font-semibold">{r.who}</p>
              <p className="text-muted text-[14px] leading-[22px]">{r.why}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function Pricing() {
  return (
    <Section id="pricing" className="border-rule/60 border-t">
      <Container>
        <div className="border-signal/20 from-signal/[0.05] relative overflow-hidden rounded-2xl border bg-gradient-to-b to-transparent p-8 sm:p-12">
          <div aria-hidden className="halo pointer-events-none absolute inset-x-0 top-0 h-48" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <Eyebrow>Early access</Eyebrow>
              <h2 className="display text-ink mt-4 text-[clamp(26px,3.4vw,40px)]">
                Free to explore while in early access
              </h2>
              <p className="text-muted mt-4 max-w-[52ch] text-[15.5px] leading-[25px]">
                There&apos;s no paid plan or checkout yet. Request access and run the platform. AI
                assistance is optional and bills through whichever model provider you configure —
                including your own paid Claude API account — never through Kinetix.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/register" variant="primary" className="h-11 px-5 text-[15px]">
                  Request access <ArrowRight />
                </ButtonLink>
                <ButtonLink href="/security" variant="secondary" className="h-11 px-5 text-[15px]">
                  Review security
                </ButtonLink>
              </div>
            </div>
            <ul className="border-rule bg-sunken/50 flex flex-col gap-3 rounded-lg border p-6">
              {[
                "Full assessment workflow",
                "SAST, dependency & secret scanning",
                "AI validation with your own key",
                "CVE / OSV / PDF exports",
              ].map((f) => (
                <li key={f} className="text-ink flex items-center gap-3 text-[14px]">
                  <FileCheck2 className="text-vg size-4 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </Section>
  );
}

function FaqSection() {
  return (
    <Section id="faq" className="border-rule/60 border-t">
      <Container className="max-w-4xl">
        <SectionHeading eyebrow="FAQ" title="Questions, answered honestly" align="center" className="mx-auto" />
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
      <Container className="flex flex-col items-center gap-6 text-center">
        <h2 className="display text-ink text-[clamp(30px,4.6vw,52px)]">
          Stop triaging noise. <span className="text-signal">Start finding real paths.</span>
        </h2>
        <p className="text-muted max-w-[52ch] text-[17px] leading-[27px]">
          Bring a repository you&apos;re authorized to test and see what a validated, evidence-backed
          assessment looks like.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/register" variant="primary" className="h-11 px-6 text-[15px]">
            Request access <ArrowRight />
          </ButtonLink>
          <Link
            href="/product"
            className="text-muted hover:text-ink inline-flex h-11 items-center px-4 text-[15px] font-medium"
          >
            Explore the product
          </Link>
        </div>
      </Container>
    </Section>
  );
}
