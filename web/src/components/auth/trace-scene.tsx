"use client";

import clsx from "clsx";
import { RotateCcw, ScanSearch, UserRoundCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  AI_VERDICT_CLASS,
  AI_VERDICT_LABEL,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  TRIAGE_NAME,
} from "@/lib/format";
import type { Severity } from "@/lib/types";

import { useMediaQuery, useReducedMotion } from "./media";

type Role = "source" | "flow" | "guard" | "sink";

interface Hop {
  line: number;
  role: Role;
  /** The expression on this line the trace passes through. */
  mark: string;
  /** A shorter name for it in the caption, when the expression is long. */
  label?: string;
  /** A variable that carries untrusted data from here on. */
  taint?: string;
  /** A variable that holds the data after an effective guard. */
  clean?: string;
  note: string;
}

interface Answer {
  label: string;
  answer: "yes" | "no";
  line: number;
}

interface Sample {
  id: string;
  tab: string;
  path: string;
  cwe: string;
  severity: Severity | null;
  verdict: "likely_vulnerable" | "likely_false_positive";
  code: string[];
  hops: Hop[];
  answers: [Answer, Answer, Answer];
  summary: string;
}

// Fictional snippets that illustrate how a finding is traced and triaged. Never live data.
const SAMPLES: Sample[] = [
  {
    id: "traversal",
    tab: "files.ts",
    path: "src/routes/files.ts",
    cwe: "CWE-22",
    severity: "high",
    verdict: "likely_vulnerable",
    code: [
      'app.get("/files", async (req, res) => {',
      "  const name = req.query.file;",
      "  const target = path.join(ROOT, name);",
      "  const data = await fs.readFile(target);",
      '  res.type("text/plain").send(data);',
      "});",
    ],
    hops: [
      {
        line: 2,
        role: "source",
        mark: "req.query.file",
        taint: "name",
        note: "the query string is attacker-controlled",
      },
      {
        line: 3,
        role: "flow",
        mark: "path.join(ROOT, name)",
        taint: "target",
        note: "path.join keeps ../ segments, so name can climb out of ROOT",
      },
      { line: 4, role: "sink", mark: "fs.readFile(target)", note: "reads whatever path arrives" },
    ],
    answers: [
      { label: "Input is attacker-controlled", answer: "yes", line: 2 },
      { label: "Input reaches the flagged operation", answer: "yes", line: 4 },
      { label: "An effective guard is on the path", answer: "no", line: 3 },
    ],
    summary:
      "Illustrative trace of files.ts: req.query.file on line 2 flows through path.join on line 3 into fs.readFile on line 4. Agentic Triage answers that the input is attacker-controlled (line 2), reaches the read (line 4), and is not guarded (line 3). Derived verdict: likely real, high severity, CWE-22, pending a researcher's review.",
  },
  {
    id: "sqli",
    tab: "orders.py",
    path: "app/orders.py",
    cwe: "CWE-89",
    severity: "critical",
    verdict: "likely_vulnerable",
    code: [
      '@app.route("/orders")',
      "def order():",
      '    oid = request.args.get("id")',
      '    q = f"SELECT * FROM orders WHERE id={oid}"',
      "    row = db.execute(q).fetchone()",
      "    return jsonify(row)",
    ],
    hops: [
      {
        line: 3,
        role: "source",
        mark: 'request.args.get("id")',
        taint: "oid",
        note: "a query parameter the client controls",
      },
      {
        line: 4,
        role: "flow",
        mark: 'f"SELECT * FROM orders WHERE id={oid}"',
        label: 'f"…{oid}"',
        taint: "q",
        note: "an f-string splices oid into the SQL text",
      },
      { line: 5, role: "sink", mark: "db.execute(q)", note: "runs the built string as SQL" },
    ],
    answers: [
      { label: "Input is attacker-controlled", answer: "yes", line: 3 },
      { label: "Input reaches the flagged operation", answer: "yes", line: 5 },
      { label: "An effective guard is on the path", answer: "no", line: 4 },
    ],
    summary:
      "Illustrative trace of orders.py: request.args on line 3 is interpolated into SQL on line 4 and executed on line 5. Agentic Triage answers attacker-controlled (line 3), reaches the query (line 5), not parameterized (line 4). Derived verdict: likely real, critical severity, CWE-89, pending a researcher's review.",
  },
  {
    id: "xss",
    tab: "search.ts",
    path: "src/routes/search.ts",
    cwe: "CWE-79",
    severity: null,
    verdict: "likely_false_positive",
    code: [
      'app.get("/search", (req, res) => {',
      '  const q = String(req.query.q ?? "");',
      "  const safe = escapeHtml(q);",
      "  res.send(`<p>Results for ${safe}</p>`);",
      "});",
    ],
    hops: [
      {
        line: 2,
        role: "source",
        mark: "req.query.q",
        taint: "q",
        note: "the search term is attacker-controlled",
      },
      {
        line: 3,
        role: "guard",
        mark: "escapeHtml(q)",
        clean: "safe",
        note: "escapeHtml encodes < > & \" ' before output",
      },
      {
        line: 4,
        role: "sink",
        mark: "res.send(",
        label: "res.send",
        note: "writes HTML, but only the escaped value",
      },
    ],
    answers: [
      { label: "Input is attacker-controlled", answer: "yes", line: 2 },
      { label: "Input reaches the flagged operation", answer: "yes", line: 4 },
      { label: "An effective guard is on the path", answer: "yes", line: 3 },
    ],
    summary:
      "Illustrative trace of search.ts: req.query.q on line 2 is escaped by escapeHtml on line 3 before res.send on line 4. Agentic Triage answers attacker-controlled (line 2), reaches the response (line 4), and guarded (line 3). Derived verdict: likely a false positive, for a researcher to close or keep.",
  },
];

const ROLE_LABEL: Record<Role, string> = { source: "Source", flow: "Flow", guard: "Guard", sink: "Sink" };

const PHASES = [
  { label: "Analyze", sub: "Taint rules" },
  { label: TRIAGE_NAME, sub: "Cited answers" },
  { label: "You review", sub: "Confirm or close" },
  { label: "Disclose", sub: "CVE · OSV · PDF" },
];

// Code geometry (px): line height, vertical padding, and the trace rail's x in the gutter.
const LINE = 24;
const PAD = 10;
const RAIL_X = 42;
const lineY = (n: number) => PAD + (n - 1) * LINE + LINE / 2;

// Pacing (ms) of the trace, the cited answers, the verdict, and the rest before the next sample.
const FIRST = 1000;
const HOP = 850;
const ASK = 650;
const VERDICT = 800;
const HOLD = 6000;

const KEYWORDS = new Set([
  "const",
  "let",
  "async",
  "await",
  "return",
  "def",
  "if",
  "else",
  "new",
  "function",
  "import",
  "from",
]);
const TOKEN =
  /(f?"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[A-Za-z_$][\w$]*|\d+|\s+|[^\sA-Za-z_$\d"'`]+|.)/g;

const TAINT_CLASS =
  "text-ink font-medium underline decoration-ink/70 decoration-dotted decoration-[1.5px] underline-offset-[5px]";
const CLEAN_CLASS = "text-ink/85 underline decoration-ink/30 underline-offset-[5px]";

/** Split text around the tainted / sanitized names (also inside f-strings and templates). */
function emphasize(text: string, taint: string[], clean: string[], base: string, key: string): ReactNode[] {
  const names = [...taint, ...clean];
  if (!names.length)
    return [
      <span key={key} className={base}>
        {text}
      </span>,
    ];
  const re = new RegExp(`\\b(${names.join("|")})\\b`, "g");
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at)
      out.push(
        <span key={`${key}-${at}`} className={base}>
          {text.slice(at, i)}
        </span>,
      );
    out.push(
      <span key={`${key}-${i}m`} className={clean.includes(m[0]) ? CLEAN_CLASS : TAINT_CLASS}>
        {m[0]}
      </span>,
    );
    at = i + m[0].length;
  }
  if (at < text.length)
    out.push(
      <span key={`${key}-${at}`} className={base}>
        {text.slice(at)}
      </span>,
    );
  return out;
}

/** A tiny monochrome highlighter: brightness and weight carry the syntax, not colour. */
function highlight(text: string, taint: string[], clean: string[], key: string): ReactNode[] {
  const tokens = text.match(TOKEN) ?? [];
  return tokens.flatMap((tok, i): ReactNode[] => {
    const k = `${key}-${i}`;
    const next = tokens[i + 1] ?? "";
    if (/^\s+$/.test(tok)) return [tok];
    if (/^f?["'`]/.test(tok) && tok.length > 1) return emphasize(tok, taint, clean, "text-ink/55", k);
    if (/^\d+$/.test(tok))
      return [
        <span key={k} className="text-ink/55">
          {tok}
        </span>,
      ];
    if (/^[A-Za-z_$]/.test(tok)) {
      if (KEYWORDS.has(tok))
        return [
          <span key={k} className="text-muted">
            {tok}
          </span>,
        ];
      return emphasize(tok, taint, clean, next.startsWith("(") ? "text-ink" : "text-ink/80", k);
    }
    return [
      <span key={k} className="text-ink/35">
        {tok}
      </span>,
    ];
  });
}

function CodeText({
  text,
  hop,
  lit,
  taint,
  clean,
  n,
}: {
  text: string;
  hop?: Hop;
  lit: boolean;
  taint: string[];
  clean: string[];
  n: number;
}) {
  const i = hop ? text.indexOf(hop.mark) : -1;
  if (!hop || i < 0) return <>{highlight(text, taint, clean, `l${n}`)}</>;
  return (
    <>
      {highlight(text.slice(0, i), taint, clean, `l${n}a`)}
      <span
        className={clsx(
          "-mx-0.5 rounded-[4px] px-0.5 ring-1 transition-[background-color,box-shadow] duration-500 ring-inset",
          lit ? "bg-ink/[0.09] ring-ink/25" : "ring-transparent",
        )}
      >
        {highlight(hop.mark, taint, clean, `l${n}m`)}
      </span>
      {highlight(text.slice(i + hop.mark.length), taint, clean, `l${n}b`)}
    </>
  );
}

/**
 * How KinetixZero reads code, as a small interactive editor: pick a sample file, watch the
 * taint trace hop from source to sink, then Agentic Triage's three cited answers and the verdict
 * KinetixZero derives from them, which waits on a researcher. Hover a line or a citation to
 * light it up. Illustrative only; it runs while visible and stays still for reduced motion.
 */
export function TraceScene() {
  const reduced = useReducedMotion();
  // The panel only shows on wide screens; don't animate it while it's hidden.
  const visible = useMediaQuery("(min-width: 1024px)");
  const still = reduced;

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const [manual, setManual] = useState(false);
  const [hold, setHold] = useState(false);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const [citeLine, setCiteLine] = useState<number | null>(null);

  const sample = SAMPLES[index]!;
  const { hops, answers, verdict } = sample;
  const total = hops.length + answers.length + 1;
  const shown = still ? total : step;
  const hopsShown = Math.min(shown, hops.length);
  const asked = Math.max(0, Math.min(shown - hops.length, answers.length));
  const decided = shown >= total;

  // Advance the trace one event at a time.
  useEffect(() => {
    if (still || !visible || step >= total) return;
    const delay = step === 0 ? FIRST : step < hops.length ? HOP : step < total - 1 ? ASK : VERDICT;
    const t = window.setTimeout(() => setStep((s) => s + 1), delay);
    return () => window.clearTimeout(t);
  }, [still, visible, step, total, hops.length, run]);

  // Rest on the verdict, then move to the next sample, unless someone is reading or chose one.
  const rotating = decided && !still && visible && !manual && !hold;
  useEffect(() => {
    if (!rotating) return;
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1) % SAMPLES.length);
      setStep(0);
      setRun((r) => r + 1);
    }, HOLD);
    return () => window.clearTimeout(t);
  }, [rotating, index]);

  function pick(i: number) {
    setManual(true);
    setIndex(i);
    setStep(0);
    setRun((r) => r + 1);
    setHoverLine(null);
    setCiteLine(null);
  }

  function replay() {
    setStep(0);
    setRun((r) => r + 1);
  }

  const revealed = hops.slice(0, hopsShown);
  const taint = revealed.flatMap((h) => (h.taint ? [h.taint] : []));
  const clean = revealed.flatMap((h) => (h.clean ? [h.clean] : []));
  const hopAt = new Map(hops.map((h, i) => [h.line, { hop: h, i }]));

  const latest = decided
    ? null
    : asked > 0
      ? answers[asked - 1]!.line
      : hopsShown > 0
        ? hops[hopsShown - 1]!.line
        : null;
  const focus = hoverLine ?? citeLine ?? latest;
  const focusHop = focus !== null ? hopAt.get(focus) : undefined;

  const guardIndex = hops.findIndex((h) => h.role === "guard");
  const flowEnd = verdict === "likely_vulnerable" || guardIndex < 0 ? hops.length - 1 : guardIndex;
  const phase = shown < hops.length ? 0 : decided ? 2 : 1;
  const height = PAD * 2 + sample.code.length * LINE;

  let caption: ReactNode;
  if (focus !== null && focusHop) {
    const { hop } = focusHop;
    caption = (
      <>
        <span className="text-ink shrink-0">L{focus}</span>
        <span className="text-ink/80 eyebrow shrink-0 text-[9.5px]">{ROLE_LABEL[hop.role]}</span>
        <span className="min-w-0 truncate">
          <span className="text-ink/80">{hop.label ?? hop.mark}</span> — {hop.note}
        </span>
      </>
    );
  } else if (focus !== null) {
    caption = (
      <>
        <span className="text-ink shrink-0">L{focus}</span>
        <span className="min-w-0 truncate">not on the traced path</span>
      </>
    );
  } else if (decided) {
    caption = (
      <span className="min-w-0 truncate">
        Traced in {hops.length} hops · each answer cites a line · hover to inspect
      </span>
    );
  } else {
    caption = <span className="min-w-0 truncate">Reading {sample.path}…</span>;
  }

  return (
    <div
      className="flex flex-col gap-5"
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
    >
      <p className="sr-only">{sample.summary}</p>

      <div className="border-rule-strong/60 bg-raised/75 overflow-hidden rounded-2xl border backdrop-blur-md">
        {/* Editor chrome: sample tabs and replay */}
        <div className="border-rule flex h-10 items-center gap-3 border-b pr-1.5 pl-3.5">
          <span aria-hidden className="flex gap-1.5">
            <span className="bg-ink/15 size-2 rounded-full" />
            <span className="bg-ink/15 size-2 rounded-full" />
            <span className="bg-ink/15 size-2 rounded-full" />
          </span>
          <div role="tablist" aria-label="Illustrative samples" className="flex min-w-0 items-center gap-0.5">
            {SAMPLES.map((s, i) => {
              const active = i === index;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => pick(i)}
                  className={clsx(
                    "relative h-7 rounded-md px-2.5 font-mono text-[11.5px] transition-colors",
                    active ? "bg-ink/[0.08] text-ink" : "text-muted hover:text-ink hover:bg-ink/[0.04]",
                  )}
                >
                  {s.tab}
                  {/* Time until the next sample. */}
                  {active && rotating ? (
                    <svg
                      key={run}
                      aria-hidden
                      viewBox="0 0 100 2"
                      preserveAspectRatio="none"
                      className="absolute inset-x-2 -bottom-[5px] h-[2px] w-[calc(100%-1rem)]"
                    >
                      <path
                        d="M0 1 H100"
                        stroke="var(--ink)"
                        strokeOpacity={0.6}
                        strokeWidth={2}
                        pathLength={1}
                        strokeDasharray="1 1.2"
                        style={{ strokeDashoffset: 1.1, animation: `kx-draw ${HOLD}ms linear forwards` }}
                      />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>
          <span className="text-muted ml-auto hidden truncate font-mono text-[10.5px] 2xl:inline">
            {sample.path}
          </span>
          {still ? null : (
            <button
              type="button"
              onClick={replay}
              aria-label="Replay the trace"
              title="Replay"
              className="text-muted hover:text-ink hover:bg-ink/[0.06] ml-auto grid size-7 shrink-0 place-items-center rounded-md transition-colors 2xl:ml-0"
            >
              <RotateCcw className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        {/* Code with the trace rail in the gutter */}
        <div
          aria-hidden
          className="relative font-mono text-[12px]"
          style={{ height }}
          onMouseLeave={() => setHoverLine(null)}
        >
          <svg className="pointer-events-none absolute top-0 left-0" width={RAIL_X + 10} height={height}>
            <path
              d={`M${RAIL_X} ${lineY(hops[0]!.line)} V ${lineY(hops[hops.length - 1]!.line)}`}
              stroke="var(--ink)"
              strokeOpacity={0.1}
            />
            {hops.slice(1).map((h, i) => {
              const from = hops[i]!;
              const drawn = i + 1 < hopsShown;
              const cleaned = from.role === "guard";
              return (
                <path
                  key={`${sample.id}-${run}-seg${i}`}
                  d={`M${RAIL_X} ${lineY(from.line)} V ${lineY(h.line)}`}
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                  strokeOpacity={cleaned ? 0.45 : 0.9}
                  pathLength={1}
                  strokeDasharray={cleaned ? "0.06 0.06" : "1 1.2"}
                  style={
                    cleaned
                      ? { opacity: drawn ? 1 : 0, transition: "opacity 600ms ease-out" }
                      : {
                          strokeDashoffset: drawn ? 0 : 1.1,
                          transition: "stroke-dashoffset 650ms cubic-bezier(0.4,0,0.2,1)",
                        }
                  }
                />
              );
            })}
            {hops.map((h, i) => {
              const lit = i < hopsShown;
              const y = lineY(h.line);
              const hollow = h.role === "flow" || h.role === "guard" || (h.role === "sink" && flowEnd < i);
              return (
                <g
                  key={`${sample.id}-${run}-node${i}`}
                  style={{ opacity: lit ? 1 : 0.25, transition: "opacity 300ms ease-out" }}
                >
                  {h.role === "guard" ? (
                    <rect
                      x={RAIL_X - 3.5}
                      y={y - 3.5}
                      width={7}
                      height={7}
                      transform={`rotate(45 ${RAIL_X} ${y})`}
                      fill="var(--raised)"
                      stroke="var(--ink)"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle
                      cx={RAIL_X}
                      cy={y}
                      r={h.role === "sink" ? 4.5 : h.role === "source" ? 3.5 : 3}
                      fill={hollow ? "var(--raised)" : "var(--ink)"}
                      stroke="var(--ink)"
                      strokeWidth={1.5}
                    />
                  )}
                  {/* One ripple as the trace arrives; a steady one on a reachable sink. */}
                  {lit && !still ? (
                    <circle
                      cx={RAIL_X}
                      cy={y}
                      r={h.role === "sink" ? 4.5 : 3.5}
                      fill="none"
                      stroke="var(--ink)"
                      style={{
                        transformBox: "fill-box",
                        transformOrigin: "center",
                        opacity: 0,
                        animation:
                          h.role === "sink" && !hollow
                            ? "kx-pulse-ring 2.4s cubic-bezier(0.2,0.7,0.2,1) infinite"
                            : "kx-pulse-ring 0.9s cubic-bezier(0.2,0.7,0.2,1) 1",
                      }}
                    />
                  ) : null}
                </g>
              );
            })}
            {/* Once traced, data keeps flowing to wherever it stops: the sink, or the guard. */}
            {decided && !still ? (
              <circle key={`${sample.id}-${run}-packet`} r={2.2} fill="var(--ink)" opacity={0}>
                <animateMotion
                  path={`M${RAIL_X} ${lineY(hops[0]!.line)} V ${lineY(hops[flowEnd]!.line)}`}
                  dur="1.6s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.45 0 0.25 1"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.15;0.8;1"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </circle>
            ) : null}
          </svg>

          <div key={`${sample.id}-${run}`} className="absolute inset-x-0" style={{ top: PAD }}>
            {sample.code.map((text, idx) => {
              const n = idx + 1;
              const at = hopAt.get(n);
              const lit = at ? at.i < hopsShown : false;
              const focused = focus === n;
              return (
                <div
                  key={n}
                  onMouseEnter={() => setHoverLine(n)}
                  className={clsx(
                    "kx-fade-up relative flex items-center pr-3 pl-2 transition-colors duration-300",
                    focused && "bg-ink/[0.055]",
                  )}
                  style={{ height: LINE, animationDelay: `${idx * 55}ms` }}
                >
                  <span
                    className={clsx(
                      "bg-ink absolute inset-y-0 left-0 w-[2px] transition-opacity duration-300",
                      focused ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span
                    className={clsx(
                      "w-6 shrink-0 text-right tabular-nums transition-colors select-none",
                      focused ? "text-ink" : "text-ink/25",
                    )}
                  >
                    {n}
                  </span>
                  <span className="w-[22px] shrink-0" />
                  <code className="min-w-0 flex-1 overflow-hidden leading-6 text-ellipsis whitespace-pre">
                    <CodeText text={text} hop={at?.hop} lit={lit} taint={taint} clean={clean} n={n} />
                  </code>
                  {at && lit ? (
                    <span className="kx-fade-up border-rule-strong bg-raised text-ink/80 absolute right-2.5 hidden h-[18px] items-center rounded-full border px-1.5 font-mono text-[9px] tracking-[0.14em] uppercase xl:inline-flex">
                      {ROLE_LABEL[at.hop.role]}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* What the trace says about the focused line */}
        <div
          aria-hidden
          className="border-rule text-muted flex h-8 items-center gap-2 border-t px-4 font-mono text-[11px]"
        >
          {caption}
        </div>

        {/* Agentic Triage: three questions, each answered with a cited line */}
        <div className="border-rule border-t px-4 pt-2.5 pb-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="eyebrow text-ink inline-flex items-center gap-1.5 text-[10px]">
              <ScanSearch className="size-3.5" aria-hidden />
              {TRIAGE_NAME}
            </span>
            <span className="eyebrow text-muted text-[10px]">Advisory · cited</span>
          </div>
          <ul>
            {answers.map((a, i) => {
              const on = i < asked;
              return (
                <li key={a.label} className="flex h-7 items-center gap-3 text-[12.5px]">
                  <span
                    aria-hidden
                    className={clsx(
                      "size-1.5 shrink-0 rounded-full transition-colors duration-300",
                      on ? "bg-ink" : "bg-ink/20",
                    )}
                  />
                  <span
                    className={clsx(
                      "min-w-0 flex-1 truncate transition-colors duration-300",
                      on ? "text-ink/90" : "text-muted",
                    )}
                  >
                    {a.label}
                  </span>
                  {on ? (
                    <>
                      <span className="kx-fade-up text-ink w-7 font-mono text-[11px] tracking-[0.12em] uppercase">
                        {a.answer}
                      </span>
                      <button
                        type="button"
                        aria-label={`Cited line ${a.line}`}
                        onMouseEnter={() => setCiteLine(a.line)}
                        onMouseLeave={() => setCiteLine(null)}
                        onFocus={() => setCiteLine(a.line)}
                        onBlur={() => setCiteLine(null)}
                        className={clsx(
                          "kx-fade-up grid h-5 w-9 place-items-center rounded-md border font-mono text-[10.5px] transition-colors",
                          citeLine === a.line
                            ? "border-ink text-ink"
                            : "border-rule-strong text-muted hover:border-ink hover:text-ink",
                        )}
                      >
                        L{a.line}
                      </button>
                    </>
                  ) : (
                    <span
                      aria-hidden
                      className="bg-ink/[0.06] h-2 w-[4.25rem] animate-[kx-shimmer_1.6s_linear_infinite] rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)] bg-[length:200%_100%]"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* The verdict KinetixZero derives from those answers, waiting on a person */}
        <div className="border-rule flex min-h-12 items-center gap-3 border-t px-4 py-2.5">
          {decided ? (
            <div
              key={`${sample.id}-${run}-verdict`}
              className="kx-fade-up flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
            >
              <span className="eyebrow text-muted text-[10px]">Verdict</span>
              <span
                className={clsx(
                  "inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-medium",
                  AI_VERDICT_CLASS[verdict],
                )}
              >
                {AI_VERDICT_LABEL[verdict]}
              </span>
              {sample.severity ? (
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 text-[12px] font-semibold",
                    SEVERITY_COLOR[sample.severity],
                  )}
                >
                  <span aria-hidden className="h-3.5 w-[3px] rounded-sm bg-current" />
                  {SEVERITY_LABEL[sample.severity]}
                </span>
              ) : null}
              <span className="text-muted font-mono text-[11px]">{sample.cwe}</span>
            </div>
          ) : (
            <div className="text-muted flex min-w-0 flex-1 items-center gap-2.5 text-[12.5px]">
              <span
                aria-hidden
                className="border-ink/50 size-3.5 shrink-0 animate-[kx-spin_0.9s_linear_infinite] rounded-full border-[1.5px] border-t-transparent"
              />
              <span className="truncate">Deriving the verdict from cited answers…</span>
            </div>
          )}
          <span
            className={clsx(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition-colors duration-500",
              decided ? "border-ink/70 text-ink" : "border-rule text-muted",
            )}
          >
            <UserRoundCheck className="size-3.5" aria-hidden />
            {verdict === "likely_vulnerable" ? "You confirm" : "You decide"}
          </span>
        </div>
      </div>

      {/* Where this sits in the workflow */}
      <ol aria-label="Workflow" className="grid grid-cols-4 [@media(max-height:780px)]:hidden">
        {PHASES.map((p, i) => (
          <li
            key={p.label}
            className="flex min-w-0 flex-col gap-2"
            aria-current={i === phase ? "step" : undefined}
          >
            <div className="flex items-center">
              <span
                className={clsx(
                  "relative grid size-2.5 shrink-0 place-items-center rounded-full border transition-colors duration-500",
                  i < phase ? "border-ink bg-ink" : i === phase ? "border-ink" : "border-rule-strong",
                )}
              >
                {i === phase ? (
                  <>
                    <span className="bg-ink size-1 rounded-full" />
                    <span className="kx-pulse-ring border-ink absolute inset-0 rounded-full border opacity-0" />
                  </>
                ) : null}
              </span>
              {i < PHASES.length - 1 ? (
                <span className="bg-rule-strong/50 relative mx-2 h-px flex-1 overflow-hidden">
                  <span
                    className="bg-ink absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
                    style={{ width: i < phase ? "100%" : "0%" }}
                  />
                </span>
              ) : null}
            </div>
            <div className="min-w-0 pr-2">
              <p
                className={clsx(
                  "truncate text-[12px] font-medium transition-colors duration-500",
                  i <= phase ? "text-ink" : "text-muted",
                )}
              >
                {p.label}
              </p>
              <p className="text-muted truncate font-mono text-[10.5px]">{p.sub}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
