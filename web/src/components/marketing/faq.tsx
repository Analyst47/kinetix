"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Does KinetixZero attack or exploit live systems?",
    a: "No. KinetixZero performs read-only static analysis of source code and dependencies you are authorized to assess. It never sends exploits or traffic to a running target. The radar maps the paths untrusted input could take through the code and where findings sit along them; a researcher validates and reproduces anything real.",
  },
  {
    q: "Does it replace human penetration testers?",
    a: "No. It does the heavy, repetitive work — reading code, matching dependencies against advisories, and ranking what's worth a human's time. The AI produces hypotheses with cited evidence; it never confirms a vulnerability, changes a finding's state, or contacts anyone. You decide what is real.",
  },
  {
    q: "What targets can I analyze?",
    a: "Source you are authorized to test: your own repositories, open-source projects, assets inside a bug-bounty scope, or code you have written permission to assess. Every project records an authorization attestation and scope boundaries before analysis runs.",
  },
  {
    q: "How does it separate real findings from noise?",
    a: "Every finding carries a confidence level: Firm for a taint-tracked source-to-sink path or a matched advisory, Tentative for a pattern match. The AI pass then answers whether input is attacker-controlled, reaches the sink, and is sanitized — citing exact lines. KinetixZero verifies each citation and derives the verdict itself, downgrading anything uncited.",
  },
  {
    q: "What is an Agentic Triage run, and what do I get for free?",
    a: "One Agentic Triage run is one model call: an Analyze, an Ask, a Draft, or one finding reviewed during a triage pass. Every account includes 10 free runs. Paid plans include a larger allowance that resets every month. A run that fails on our side isn't counted. It is advisory triage of code you're authorized to analyze — it never attacks or tests a live system.",
  },
  {
    q: "Where does my code go when I use AI?",
    a: "Only the minimal context for one finding — its details and up to 60 nearby lines of source — is sent to the model, and only when you click Analyze, Ask, Draft or Triage. Code from the target is fenced off as untrusted data, and every request is recorded in the finding's chain of custody with a SHA-256 of exactly what was sent.",
  },
  {
    q: "What does an assessment produce?",
    a: "A ranked list of findings with severity, location, confidence, reproduction notes, impact and remediation, plus exports in CVE Record 5.1 and OSV formats, a PDF report and a labeled JSONL dataset. Evidence and chain-of-custody hashes travel with every export.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="border-rule divide-rule divide-y border-y">
      {FAQS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="group flex w-full items-center gap-6 py-6 text-left"
            >
              <span className="eyebrow text-muted w-8 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-ink flex-1 text-[17px] font-medium tracking-[-0.01em]">{item.q}</span>
              <span className="border-rule-strong text-ink group-hover:border-ink grid size-8 shrink-0 place-items-center rounded-full border transition-colors">
                {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
              </span>
            </button>
            {isOpen ? (
              <p className="text-muted max-w-[72ch] pb-7 pl-14 text-[15px] leading-[25px]">{item.a}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
