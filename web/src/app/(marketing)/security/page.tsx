import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { Container, DotGlyph, PageHero, Section, SectionHeading } from "@/components/marketing/ui";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Security & responsible use",
  description:
    "The safeguards that are actually enforced in KinetixZero: read-only analysis, authorization attestations, tenant isolation, and an auditable trail.",
};

const CONTROLS = [
  {
    title: "Read-only static analysis",
    body: "KinetixZero analyzes source code and dependencies. It does not launch exploits or attacks against live systems. A human researcher validates and reproduces findings before anything is treated as real.",
  },
  {
    title: "Authorization on every project",
    body: "Each project records an explicit authorization attestation and in/out-of-scope boundaries, captured with the attester and timestamp. The platform is intended only for targets you are permitted to analyze.",
  },
  {
    title: "Isolation at the database",
    body: "Workspaces are isolated with PostgreSQL row-level security and a restricted application role that cannot bypass it; each user's plan and usage is isolated the same way. A startup guard refuses to serve in production on a connection that could bypass it.",
  },
  {
    title: "Hardened target fetch",
    body: "Git targets are cloned over HTTPS with pinned public IPs, no redirects, hooks, submodules or LFS, and symlinks flattened to plain files — so a target's repository can't execute code on the host.",
  },
  {
    title: "Modern authentication",
    body: "Argon2id password hashing, opaque server-stored session tokens in HttpOnly cookies, CSRF double-submit with an origin check, and optional TOTP multi-factor authentication.",
  },
  {
    title: "Auditable end to end",
    body: "Sensitive actions — including every AI run — are written to a hash-chained, append-only audit log, and exports carry evidence and chain-of-custody hashes so a reviewer can verify the trail.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Security & trust"
        title="Safeguards that are part of the product"
        lede="Security here isn't a promise on a page — these controls are enforced in the platform itself."
      />

      <Section className="pt-0 sm:pt-0">
        <Container>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CONTROLS.map((c, i) => (
              <div
                key={c.title}
                className="border-rule bg-raised/40 flex flex-col gap-4 rounded-3xl border p-6"
              >
                <span className="border-rule-strong text-ink grid size-10 place-items-center rounded-full border">
                  <DotGlyph variant={(i % 4) as 0 | 1 | 2 | 3} />
                </span>
                <h2 className="text-ink text-[17px] font-semibold">{c.title}</h2>
                <p className="text-muted text-[14px] leading-[22px]">{c.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section id="responsible-use" className="border-rule border-t">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="Responsible use" title="The rules of the road" />
          <div className="text-ink/75 flex flex-col gap-5 text-[16px] leading-[27px]">
            <p>
              KinetixZero is a tool for authorized vulnerability research. Use it only on code you own,
              open-source projects, assets within a bug-bounty scope, or targets you have written permission
              to assess.
            </p>
            <p>
              The AI layer produces hypotheses with cited evidence. It is explicitly not proof of
              exploitability — model confidence is never presented as a confirmed vulnerability, and the human
              researcher is responsible for validation and for following each program&apos;s disclosure rules.
            </p>
            <p>
              Private findings and customer data are never shown on public pages. AI runs on
              KinetixZero&apos;s managed Claude integration: only the minimal context for one finding is sent,
              only when you ask, and the server&apos;s key never reaches your browser. Each workspace admin
              decides whether AI assistance is allowed at all.
            </p>
          </div>
        </Container>
      </Section>

      <Section className="border-rule border-t">
        <Container className="flex flex-col items-start gap-6">
          <h2 className="display text-ink text-[clamp(30px,4.4vw,54px)]">Research you can stand behind</h2>
          <ButtonLink href="/register" variant="primary" className="h-12 px-6 text-[15px]">
            Get started free <ArrowRight />
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
