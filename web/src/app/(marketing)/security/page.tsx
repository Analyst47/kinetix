import { ArrowRight, Database, FileCheck2, Lock, ScanLine, ShieldCheck, Target } from "lucide-react";
import type { Metadata } from "next";

import { Card, Container, Section, SectionHeading } from "@/components/marketing/ui";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Security & responsible use",
  description:
    "The safeguards that are actually enforced in KinetixZero: read-only analysis, authorization attestations, tenant isolation, and an auditable trail.",
};

const CONTROLS = [
  {
    icon: <ShieldCheck className="size-5" />,
    title: "Read-only static analysis",
    body: "KinetixZero analyzes source code and dependencies. It does not launch exploits or attacks against live systems. A human researcher validates and reproduces findings before anything is treated as real.",
  },
  {
    icon: <Target className="size-5" />,
    title: "Authorization on every project",
    body: "Each project records an explicit authorization attestation and in/out-of-scope boundaries, captured with the attester and timestamp. The platform is intended only for targets you are permitted to analyze.",
  },
  {
    icon: <Database className="size-5" />,
    title: "Tenant isolation at the database",
    body: "Workspaces are isolated with PostgreSQL row-level security and a restricted application role that cannot bypass it. A startup guard refuses to serve in production on a connection that could.",
  },
  {
    icon: <ScanLine className="size-5" />,
    title: "Hardened target fetch",
    body: "Git targets are cloned over HTTPS with pinned public IPs, no redirects, hooks, submodules or LFS, and symlinks flattened to plain files — so a target's repository can't execute code on the host.",
  },
  {
    icon: <Lock className="size-5" />,
    title: "Modern authentication",
    body: "Argon2id password hashing, opaque server-stored session tokens in HttpOnly cookies, CSRF double-submit with an origin check, and optional TOTP multi-factor authentication.",
  },
  {
    icon: <FileCheck2 className="size-5" />,
    title: "Auditable end to end",
    body: "Sensitive actions are written to a hash-chained audit log, and exports carry evidence and chain-of-custody hashes so a reviewer can verify the trail.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <Section className="pb-8">
        <Container className="flex flex-col items-center gap-6 text-center">
          <SectionHeading
            eyebrow="Security & trust"
            title="Safeguards that are part of the product"
            lede="Security here isn't a promise on a page — these controls are enforced in the platform itself."
            align="center"
            className="mx-auto"
          />
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {CONTROLS.map((c) => (
              <Card key={c.title}>
                <span className="border-rule bg-sunken text-signal grid size-10 place-items-center rounded-md border">
                  {c.icon}
                </span>
                <h3 className="text-ink mt-4 text-[15px] font-semibold">{c.title}</h3>
                <p className="text-muted mt-2 text-[13.5px] leading-[21px]">{c.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id="responsible-use" className="border-rule/60 border-t">
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="Responsible use" title="The rules of the road" />
          <div className="text-muted mt-6 flex flex-col gap-4 text-[15px] leading-[25px]">
            <p>
              KinetixZero is a tool for authorized vulnerability research. Use it only on code you own,
              open-source projects, assets within a bug-bounty scope, or targets you have written
              permission to assess.
            </p>
            <p>
              The AI layer produces hypotheses with cited evidence. It is explicitly not proof of
              exploitability — model confidence is never presented as a confirmed vulnerability, and
              the human researcher is responsible for validation and for following each program&apos;s
              disclosure rules.
            </p>
            <p>
              Private findings and customer data stay within your deployment and are never shown on
              public pages. If you enable AI assistance, only the minimal context for a finding is
              sent to the provider you configure, under your own account and billing.
            </p>
          </div>
        </Container>
      </Section>

      <Section className="border-rule/60 border-t">
        <Container className="flex flex-col items-center gap-5 text-center">
          <h2 className="display text-ink text-[clamp(26px,3.6vw,40px)]">
            Research you can stand behind
          </h2>
          <ButtonLink href="/register" variant="primary" className="h-11 px-6 text-[15px]">
            Request access <ArrowRight />
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
