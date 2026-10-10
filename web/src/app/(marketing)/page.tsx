import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";

import { Faq } from "@/components/marketing/faq";
import { OrbitalRadar } from "@/components/marketing/orbital-radar";
import { Pricing } from "@/components/marketing/pricing";
import { Container, DotGlyph, Eyebrow, Section, SectionHeading, Stat } from "@/components/marketing/ui";
import { Sky } from "@/components/sky";
import { ButtonLink } from "@/components/ui";
import { apiPublic } from "@/lib/server";
import type { Plan } from "@/lib/types";

export const metadata: Metadata = {
  title: "KinetixZero — Find the paths attackers would take",
  description:
    "AI-assisted application security: analyze code and dependencies, validate findings with cited evidence, and ship responsible-disclosure packages. Read-only and human-in-the-loop.",
};

async function loadPlans(): Promise<Plan[] | null> {
  try {
    return await apiPublic<Plan[]>("/billing/plans");
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const plans = await loadPlans();
  return (
    <>
      <Hero />
      <RadarSection />
      <Method />
      <Evidence />
      <Principles />
      <Section id="pricing" className="border-rule border-t">
        <Container>
          <SectionHeading
            eyebrow="Pricing"
            title="Start free. Scale your AI review when you need it."
            lede="Every account runs the full workflow. Plans differ in how many Agentic Triage runs you get each month."
          />
          <div className="mt-12">
            <Pricing plans={plans} />
          </div>
          <p className="text-muted mt-6 text-[13px]">
            Paid plans open soon — prices may change before billing launches. One Agentic Triage run is one
            model call: an Analyze, Ask, Draft, or one finding reviewed in a triage pass.
          </p>
        </Container>
      </Section>
      <Section id="faq" className="border-rule border-t">
        <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="FAQ" title="Questions, answered plainly" />
          <Faq />
        </Container>
      </Section>
      <ClosingCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative -mt-16 overflow-hidden pt-16">
      <Sky />
      <Container className="relative flex min-h-[calc(100dvh-4rem)] flex-col pt-12 pb-12 sm:pt-16">
        <div className="flex max-w-[1000px] flex-col items-start gap-7">
          <Eyebrow boxed>AI-assisted application security</Eyebrow>
          <h1 className="display text-ink text-[clamp(42px,6.2vw,84px)] leading-[0.98]">
            Find the paths attackers would take.
            <span className="text-muted"> Close them first.</span>
          </h1>
          <p className="text-ink/75 max-w-[58ch] text-[clamp(16.5px,1.4vw,19px)] leading-[1.6]">
            KinetixZero reads your source and dependencies, traces untrusted input to the operations that make
            it dangerous, and backs every finding with cited, verifiable evidence — so researchers spend their
            time on what&apos;s real.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/register" variant="primary" className="h-12 px-6 text-[15px]">
              Get started free <ArrowUpRight />
            </ButtonLink>
            <ButtonLink href="#radar" variant="secondary" className="h-12 px-6 text-[15px]">
              Explore the radar
            </ButtonLink>
          </div>
          <p className="eyebrow text-muted">Read-only · Human in the loop · Authorized targets only</p>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-x-6 gap-y-8 pt-16 lg:grid-cols-4">
          <Stat value="28" label="Taint & pattern rules" icon={<DotGlyph variant={0} className="size-6" />} />
          <Stat value="17" label="CWE classes covered" icon={<DotGlyph variant={1} className="size-6" />} />
          <Stat
            value="3"
            label="Analyzers · SAST · OSV · secrets"
            icon={<DotGlyph variant={2} className="size-6" />}
          />
          <Stat
            value="SHA-256"
            label="Hash-chained audit trail"
            icon={<DotGlyph variant={3} className="size-6" />}
          />
        </div>
      </Container>
    </section>
  );
}

function RadarSection() {
  return (
    <Section id="radar" className="border-rule border-t">
      <Container className="flex flex-col gap-12">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-end">
          <SectionHeading eyebrow="Attack-surface radar" title="See every path from input to impact" />
          <p className="text-muted text-[16px] leading-[26px]">
            Switch between how KinetixZero works and what it finds. The infrastructure view maps the routes
            untrusted input could take through an application — and where the findings sit along them — from
            static analysis alone. Hover or tap any node.
          </p>
        </div>
        <OrbitalRadar />
      </Container>
    </Section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Scope",
    body: "Create a project, attest your authorization, and set in- and out-of-scope boundaries.",
  },
  {
    n: "02",
    title: "Analyze",
    body: "Point it at a repository or archive. Taint-tracked SAST, OSV advisories and secret detection run read-only.",
  },
  {
    n: "03",
    title: "Validate",
    body: "Findings are ranked Firm or Tentative. An AI pass answers with cited lines; you keep the verdict.",
  },
  {
    n: "04",
    title: "Disclose",
    body: "Confirmed findings become CVE 5.1, OSV and PDF packages, tracked to a vendor deadline.",
  },
];

function Method() {
  return (
    <Section className="border-rule border-t">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="Authorized scope in. Filed disclosure out."
          lede="Four stages that mirror how careful research actually runs, with a person at every decision that matters."
        />
        <ol className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="border-rule flex flex-col gap-4 border-t pt-6">
              <span className="eyebrow text-muted">{s.n}</span>
              <h3 className="display text-ink text-[28px]">{s.title}</h3>
              <p className="text-muted text-[14.5px] leading-[23px]">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

/** A flat, monochrome rendering of an AI assessment — what "cited evidence" looks like. */
function Evidence() {
  const code = [
    { n: 41, text: "router.post('/login', async (req, res) => {", mark: "source" },
    { n: 42, text: "  const email = req.body.email;", mark: "source" },
    { n: 43, text: "  const user = await db.query(", mark: null },
    { n: 44, text: "    `SELECT * FROM users WHERE email = '${email}'`", mark: "sink" },
    { n: 45, text: "  );", mark: null },
  ] as const;
  const answers = [
    { q: "Input is attacker-controlled", a: "Yes", cite: "routes/login.ts:42" },
    { q: "Input reaches the flagged operation", a: "Yes", cite: "routes/login.ts:44" },
    { q: "An effective sanitizer is on the path", a: "No", cite: "routes/login.ts:44" },
  ];
  return (
    <Section className="border-rule border-t">
      <Container className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <SectionHeading
            eyebrow="Evidence, not guesswork"
            title="Every claim cites the line it came from"
            lede="The AI answers three factual questions about the data flow and must cite exact lines. KinetixZero checks each citation against the code it was shown and derives the verdict itself. Uncited claims are downgraded — never treated as proof."
          />
          <ul className="flex flex-col gap-3">
            {[
              "The verdict is advisory; confirming a finding requires your evidence.",
              "Instructions hidden in analyzed code are fenced off and flagged.",
              "Every run is recorded with a SHA-256 of exactly what was sent.",
            ].map((t) => (
              <li key={t} className="text-ink/85 flex gap-3 text-[14.5px]">
                <DotGlyph variant={2} className="text-muted mt-[3px] size-3.5" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-rule bg-raised overflow-hidden rounded-3xl border">
          <div className="border-rule flex items-center gap-3 border-b px-5 py-3.5">
            <span className="eyebrow text-muted">Finding · Sample</span>
            <span className="text-ink text-[14px] font-medium">SQL injection in login handler</span>
            <span className="text-crit ml-auto flex items-center gap-1.5 text-[12px] font-semibold">
              <span className="h-3.5 w-[3px] rounded-sm bg-current" /> Critical
            </span>
          </div>
          <pre className="border-rule overflow-x-auto border-b px-5 py-4 font-mono text-[12.5px] leading-[22px]">
            {code.map((l) => (
              <div key={l.n} className={l.mark ? "text-ink" : "text-muted"}>
                <span className="text-muted/60 mr-4 inline-block w-6 text-right select-none">{l.n}</span>
                {l.text}
                {l.mark ? (
                  <span className="border-rule-strong text-muted ml-3 rounded-full border px-1.5 text-[10px] tracking-[0.12em] uppercase">
                    {l.mark}
                  </span>
                ) : null}
              </div>
            ))}
          </pre>
          <div className="flex flex-col gap-1 px-5 py-4">
            {answers.map((r) => (
              <div
                key={r.q}
                className="border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-2.5 last:border-0"
              >
                <span className="text-ink text-[13.5px]">{r.q}</span>
                <span className="text-muted ml-auto font-mono text-[11.5px]">{r.cite}</span>
                <span className="text-ink w-8 text-right text-[13px] font-semibold">{r.a}</span>
              </div>
            ))}
          </div>
          <div className="bg-ink/[0.03] border-rule flex flex-wrap items-center gap-3 border-t px-5 py-4">
            <span className="eyebrow text-muted">Derived verdict</span>
            <span className="text-ink text-[14px] font-semibold">Likely vulnerable · high confidence</span>
            <span className="text-muted ml-auto text-[12.5px]">Awaiting your review</span>
          </div>
        </div>
      </Container>
    </Section>
  );
}

const PRINCIPLES = [
  {
    title: "Read-only",
    body: "Static analysis of code and dependencies. KinetixZero never launches exploits or sends traffic to a live target.",
  },
  {
    title: "Advisory AI",
    body: "The model produces hypotheses with verified citations. It can't confirm a finding, change state, or contact anyone.",
  },
  {
    title: "Authorized scope",
    body: "Every project records who attested authorization, when, and what's in and out of scope.",
  },
  {
    title: "Auditable",
    body: "A hash-chained, append-only audit log and evidence hashes make the whole trail verifiable.",
  },
];

function Principles() {
  return (
    <Section className="border-rule border-t">
      <Container>
        <SectionHeading
          eyebrow="Human in the loop"
          title="Built for researchers who sign their name to a finding"
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p, i) => (
            <div
              key={p.title}
              className="border-rule bg-raised/40 flex flex-col gap-4 rounded-3xl border p-6"
            >
              <span className="border-rule-strong text-ink grid size-10 place-items-center rounded-full border">
                <DotGlyph variant={(i % 4) as 0 | 1 | 2 | 3} />
              </span>
              <h3 className="text-ink text-[18px] font-semibold tracking-[-0.01em]">{p.title}</h3>
              <p className="text-muted text-[14px] leading-[22px]">{p.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function ClosingCta() {
  return (
    <section className="border-rule relative overflow-hidden border-t">
      <Sky />
      <Container className="relative flex flex-col items-center gap-7 py-28 text-center sm:py-36">
        <Eyebrow boxed>10 free Agentic Triage runs on every account</Eyebrow>
        <h2 className="display text-ink max-w-[16ch] text-[clamp(38px,6vw,76px)]">
          Stop triaging noise. Start finding real paths.
        </h2>
        <p className="text-ink/70 max-w-[52ch] text-[17px] leading-[27px]">
          Bring a repository you&apos;re authorized to test and see what an evidence-backed assessment looks
          like.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/register" variant="primary" className="h-12 px-6 text-[15px]">
            Get started free <ArrowRight />
          </ButtonLink>
          <ButtonLink href="/product" variant="secondary" className="h-12 px-6 text-[15px]">
            Explore the product
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
