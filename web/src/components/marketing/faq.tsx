"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Does Kinetix replace human penetration testers?",
    a: "No. Kinetix does the heavy, repetitive work — reading code, correlating dependencies with known advisories, and ranking what is worth a human's time. A researcher still decides what is real, reproduces it, and signs off. The AI produces hypotheses with cited evidence; it never claims proof of exploitability.",
  },
  {
    q: "What targets can I analyze?",
    a: "Source you are authorized to test: your own repositories, open-source projects, assets covered by a bug-bounty scope, or code you have written permission to assess. Every project records an authorization attestation, and Kinetix is built for read-only static analysis — it does not launch attacks against live systems.",
  },
  {
    q: "How does Kinetix tell a real finding from noise?",
    a: "Each finding carries a confidence level. 'Firm' means a taint-tracked source-to-sink path or a matched known advisory; 'Tentative' means a pattern match that still needs a human look. The optional AI pass then assesses whether input is attacker-controlled, reaches the sink, and is sanitized — and Kinetix derives the verdict server-side from cited answers, downgrading anything uncited.",
  },
  {
    q: "What does an assessment actually produce?",
    a: "A ranked list of findings with severity, affected component, confidence, reproduction notes, impact and remediation guidance — plus exports in CVE Record 5.1 and OSV formats, a PDF report, and a labeled dataset. Evidence and chain-of-custody hashes travel with every export.",
  },
  {
    q: "Where does my code and finding data go?",
    a: "Analysis runs on your own deployment. If you enable AI assistance, only the minimal context needed for a finding is sent to the model provider you configure. With your own paid Claude API key, requests go to your Anthropic account under your billing — not a shared pool. Private findings are never shown on public pages.",
  },
  {
    q: "Is there a free plan?",
    a: "Kinetix is in early access. There is no paid plan or checkout yet — request access and you can explore the platform. AI assistance uses whichever model provider you configure and bills through that provider, not Kinetix.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-rule border-rule divide-y rounded-lg border">
      {FAQS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left"
            >
              <span className="text-ink flex-1 text-[15px] font-medium">{item.q}</span>
              <ChevronDown
                className={`text-muted size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen ? (
              <p className="text-muted max-w-[72ch] px-5 pb-5 text-[14.5px] leading-[23px]">
                {item.a}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
