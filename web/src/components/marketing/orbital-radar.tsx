"use client";

import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { LogoMark } from "@/components/logo";
import { DotGlyph } from "@/components/marketing/ui";
import { StarField } from "@/components/sky";

import {
  INFRA,
  INFRA_EDGES,
  PIPELINE,
  SEVERITIES,
  SEVERITY_VAR,
  topSeverity,
  total,
  type OrbitNode,
  type Ring,
} from "./orbital-data";

type Mode = "pipeline" | "infra";

const SEVERITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" } as const;

interface Placed {
  node: OrbitNode;
  ring: number;
  x: number;
  y: number;
}

function place(rings: Ring[]): Placed[] {
  return rings.flatMap((ring, ri) =>
    ring.nodes.map((node, i) => {
      // Offset each ring so nodes on neighbouring rings don't line up on the same spoke.
      const a = ((i / ring.nodes.length) * 360 + ri * 37 - 90) * (Math.PI / 180);
      return { node, ring: ri, x: Math.cos(a) * ring.radius, y: Math.sin(a) * ring.radius };
    }),
  );
}

/** A curved path between two nodes, bowed gently toward the centre like an orbit. */
function arc(a: { x: number; y: number }, b: { x: number; y: number }) {
  const cx = ((a.x + b.x) / 2) * 0.55;
  const cy = ((a.y + b.y) / 2) * 0.55;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * The orbital attack-surface radar. Rings of nodes revolve slowly around the KinetixZero core;
 * hovering, focusing or tapping a node pauses the motion and explains it in the side panel.
 *
 * Motion is applied imperatively (one transform per ring per frame) so React never re-renders
 * on the animation loop. It stops entirely for prefers-reduced-motion, when the radar is off
 * screen, and while the tab is hidden.
 */
export function OrbitalRadar() {
  const [mode, setMode] = useState<Mode>("pipeline");
  const rings = mode === "pipeline" ? PIPELINE : INFRA;
  const placed = useMemo(() => place(rings), [rings]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const selectedId = hovered ?? pinned ?? placed[0]?.node.id;
  const selected = selectedId ? byId.get(selectedId) : undefined;

  const reduceMotion = usePrefersReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const ringEls = useRef<(SVGGElement | null)[]>([]);
  const uprightEls = useRef<Map<string, SVGGElement>>(new Map());
  const sweepEl = useRef<SVGGElement>(null);
  const angles = useRef<number[]>([]);
  const sweep = useRef(0);
  const paused = useRef(false);
  useEffect(() => {
    paused.current = hovered !== null;
  }, [hovered]);

  const apply = useCallback(() => {
    rings.forEach((_, ri) => {
      const deg = angles.current[ri] ?? 0;
      ringEls.current[ri]?.setAttribute("transform", `rotate(${deg.toFixed(3)})`);
    });
    for (const p of placed) {
      const deg = angles.current[p.ring] ?? 0;
      uprightEls.current.get(p.node.id)?.setAttribute("transform", `rotate(${(-deg).toFixed(3)})`);
    }
    sweepEl.current?.setAttribute("transform", `rotate(${sweep.current.toFixed(2)})`);
  }, [rings, placed]);

  // Reset the motion when the mode changes, and paint the first frame before the browser does.
  useLayoutEffect(() => {
    angles.current = rings.map(() => 0);
    apply();
  }, [rings, apply]);

  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    if (root.current) io.observe(root.current);
    const tick = (t: number) => {
      const dt = Math.min(64, t - last) / 1000;
      last = t;
      if (visible && !document.hidden) {
        sweep.current = (sweep.current + dt * 24) % 360;
        if (!paused.current) {
          angles.current = angles.current.map((a, i) => (a + rings[i].speed * dt) % 360);
        }
        apply();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [reduceMotion, rings, apply]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setHovered(null);
    setPinned(null);
  };

  // In infrastructure mode the whole system turns as one, so edges stay attached.
  const linkedEdges = INFRA_EDGES.filter((e) => e.from === selectedId || e.to === selectedId);
  const infraTotals = useMemo(
    () =>
      Object.fromEntries(
        SEVERITIES.map((s) => [
          s,
          INFRA.flatMap((r) => r.nodes).reduce((n, x) => n + (x.counts?.[s] ?? 0), 0),
        ]),
      ) as Record<(typeof SEVERITIES)[number], number>,
    [],
  );

  return (
    <div ref={root} className="flex flex-col gap-6">
      {/* Mode switch + summary row */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div
          role="tablist"
          aria-label="Radar view"
          className="border-rule inline-flex self-start rounded-full border p-1"
        >
          {(
            [
              ["pipeline", "Analysis pipeline", "Pipeline"],
              ["infra", "Infrastructure map", "Infrastructure"],
            ] as const
          ).map(([m, label, short]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={clsx(
                "eyebrow rounded-full px-4 py-2 transition-colors",
                mode === m ? "bg-ink text-paper" : "text-muted hover:text-ink",
              )}
            >
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{short}</span>
            </button>
          ))}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-3 sm:gap-x-7">
          {mode === "pipeline"
            ? (
                [
                  ["4", "Stages"],
                  ["3", "Analyzers"],
                  ["28", "Rules"],
                  ["3", "Export formats"],
                ] as const
              ).map(([v, l]) => (
                <div key={l} className="flex flex-col gap-1">
                  <dt className="eyebrow text-muted order-2 text-[10.5px]">{l}</dt>
                  <dd className="text-ink order-1 text-[20px] font-semibold">{v}</dd>
                </div>
              ))
            : (
                [
                  [String(placed.length), "Components", undefined],
                  [String(INFRA_EDGES.length), "Paths", undefined],
                  ...SEVERITIES.map(
                    (s) => [String(infraTotals[s]), SEVERITY_LABEL[s], SEVERITY_VAR[s]] as const,
                  ),
                ] as const
              ).map(([v, l, color]) => (
                <div key={l} className="flex flex-col gap-1">
                  <dt className="eyebrow text-muted order-2 text-[10.5px]">{l}</dt>
                  <dd className="order-1 text-[20px] font-semibold" style={{ color: color ?? "var(--ink)" }}>
                    {v}
                  </dd>
                </div>
              ))}
        </dl>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* The radar */}
        <div className="flex flex-col gap-3">
          <div className="border-rule relative overflow-hidden rounded-3xl border bg-[#030304]">
            <StarField density={0.5} />
            <svg
              viewBox="-500 -500 1000 1000"
              className="relative block aspect-square w-full"
              role="group"
              aria-label={
                mode === "pipeline"
                  ? "KinetixZero analysis pipeline, shown as rings of stages around the core"
                  : "Illustrative infrastructure map of a sample application, with findings per component"
              }
              onMouseLeave={() => setHovered(null)}
            >
              <defs>
                <linearGradient id="kx-sweep" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#fff" stopOpacity="0" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0.035" />
                </linearGradient>
              </defs>

              {/* Concentric rings */}
              {rings.map((r) => (
                <circle key={r.radius} r={r.radius} fill="none" stroke="#fff" strokeOpacity="0.09" />
              ))}
              <circle r={470} fill="none" stroke="#fff" strokeOpacity="0.05" strokeDasharray="2 10" />

              {/* Radar sweep: a faint wedge trailing a hairline. */}
              {!reduceMotion ? (
                <g ref={sweepEl}>
                  <path d="M0 0 L470 0 A470 470 0 0 0 407 -235 Z" fill="url(#kx-sweep)" />
                  <line x1="0" y1="0" x2="470" y2="0" stroke="#fff" strokeOpacity="0.14" />
                </g>
              ) : null}

              {mode === "infra" ? (
                <g ref={(el) => void (ringEls.current = [el, el, el])}>
                  {/* Paths between components */}
                  {INFRA_EDGES.map((e) => {
                    const a = byId.get(e.from);
                    const b = byId.get(e.to);
                    if (!a || !b) return null;
                    const live = e.from === selectedId || e.to === selectedId;
                    const d = arc(a, b);
                    return (
                      <g key={`${e.from}-${e.to}`}>
                        <path
                          d={d}
                          fill="none"
                          stroke={live ? SEVERITY_VAR[e.severity] : "#fff"}
                          strokeOpacity={live ? 0.85 : 0.12}
                          strokeWidth={live ? 2 : 1}
                        />
                        {live && !reduceMotion ? (
                          <circle r="4" fill={SEVERITY_VAR[e.severity]}>
                            <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
                          </circle>
                        ) : null}
                      </g>
                    );
                  })}
                  {placed.map((p) => (
                    <NodeMark
                      key={p.node.id}
                      p={p}
                      active={p.node.id === selectedId}
                      uprightRef={(el) => {
                        if (el) uprightEls.current.set(p.node.id, el);
                        else uprightEls.current.delete(p.node.id);
                      }}
                      onHover={setHovered}
                      onPin={setPinned}
                    />
                  ))}
                </g>
              ) : (
                rings.map((r, ri) => (
                  <g key={r.radius} ref={(el) => void (ringEls.current[ri] = el)}>
                    {placed
                      .filter((p) => p.ring === ri)
                      .map((p) => (
                        <g key={p.node.id}>
                          {p.node.id === selectedId ? (
                            <line
                              x1={0}
                              y1={0}
                              x2={p.x}
                              y2={p.y}
                              stroke="#fff"
                              strokeOpacity="0.35"
                              strokeDasharray="3 6"
                            />
                          ) : null}
                          <NodeMark
                            p={p}
                            active={p.node.id === selectedId}
                            uprightRef={(el) => {
                              if (el) uprightEls.current.set(p.node.id, el);
                              else uprightEls.current.delete(p.node.id);
                            }}
                            onHover={setHovered}
                            onPin={setPinned}
                          />
                        </g>
                      ))}
                  </g>
                ))
              )}

              {/* The core */}
              <circle r="64" fill="#000" stroke="#fff" strokeOpacity="0.5" />
              <circle r="78" fill="none" stroke="#fff" strokeOpacity="0.1" />
              <g transform="translate(-28 -28)" className="text-white">
                <LogoMark size={56} />
              </g>
            </svg>
          </div>

          <p className="text-muted font-mono text-[11px] tracking-[0.12em] uppercase">
            {mode === "pipeline"
              ? "Hover, focus or tap a stage"
              : "Illustrative sample assessment · not a live system"}
          </p>
        </div>

        {/* Detail panel */}
        <aside
          aria-live="polite"
          className="border-rule bg-raised/60 flex min-h-[420px] flex-col gap-5 rounded-3xl border p-6"
        >
          {selected ? (
            <>
              <div className="flex items-center gap-3">
                <span className="border-rule-strong text-ink grid size-10 place-items-center rounded-full border">
                  <DotGlyph variant={selected.node.glyph} />
                </span>
                <span className="eyebrow text-muted">{selected.node.eyebrow}</span>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="display text-ink text-[26px]">{selected.node.title}</h3>
                <p className="text-muted text-[14.5px] leading-[23px]">{selected.node.body}</p>
              </div>

              {selected.node.counts ? (
                <div className="flex flex-col gap-2">
                  <span className="eyebrow text-muted text-[10.5px]">Findings here</span>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
                    {SEVERITIES.map((s) =>
                      selected.node.counts?.[s] ? (
                        <span
                          key={s}
                          style={{
                            width: `${((selected.node.counts[s] ?? 0) / total(selected.node.counts)) * 100}%`,
                            background: SEVERITY_VAR[s],
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {SEVERITIES.map((s) => (
                      <span key={s} className="text-muted flex items-center gap-1.5 text-[12.5px]">
                        <span className="size-2 rounded-full" style={{ background: SEVERITY_VAR[s] }} />
                        {SEVERITY_LABEL[s]}
                        <span className="text-ink font-medium">{selected.node.counts?.[s] ?? 0}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2.5">
                <span className="eyebrow text-muted text-[10.5px]">
                  {mode === "pipeline" ? "What it does" : "What KinetixZero checks here"}
                </span>
                <ul className="flex flex-col gap-2">
                  {selected.node.checks.map((c) => (
                    <li key={c} className="text-ink flex gap-2.5 text-[13.5px] leading-[20px]">
                      <span aria-hidden className="bg-muted mt-[8px] size-1 shrink-0 rounded-full" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              {mode === "infra" && linkedEdges.length ? (
                <div className="flex flex-col gap-2.5">
                  <span className="eyebrow text-muted text-[10.5px]">Paths through this component</span>
                  <ul className="flex flex-col gap-2">
                    {linkedEdges.map((e) => (
                      <li key={`${e.from}-${e.to}`} className="flex items-start gap-2.5 text-[13px]">
                        <span
                          aria-hidden
                          className="mt-[6px] h-0.5 w-3 shrink-0 rounded-full"
                          style={{ background: SEVERITY_VAR[e.severity] }}
                        />
                        <span>
                          <span className="text-ink">
                            {byId.get(e.from)?.node.label} → {byId.get(e.to)?.node.label}
                          </span>
                          <span className="text-muted"> · {e.label}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="text-muted border-rule mt-auto border-t pt-4 text-[12.5px] leading-[19px]">
                {mode === "pipeline"
                  ? "Read-only static analysis of code you're authorized to assess. A researcher validates and reproduces every finding."
                  : "The map shows the paths untrusted input could take and where findings sit along them, derived from static analysis. Nothing here touches a live system."}
              </p>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function NodeMark({
  p,
  active,
  uprightRef,
  onHover,
  onPin,
}: {
  p: Placed;
  active: boolean;
  uprightRef: (el: SVGGElement | null) => void;
  onHover: (id: string | null) => void;
  onPin: (id: string) => void;
}) {
  const sev = topSeverity(p.node.counts);
  const count = total(p.node.counts);
  return (
    <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
      <g ref={uprightRef}>
        <g
          role="button"
          tabIndex={0}
          aria-label={`${p.node.label}${count ? `, ${count} findings` : ""}`}
          aria-pressed={active}
          className="cursor-pointer outline-none"
          onMouseEnter={() => onHover(p.node.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(p.node.id)}
          onBlur={() => onHover(null)}
          onClick={() => onPin(p.node.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPin(p.node.id);
            }
          }}
        >
          {/* Generous invisible hit area for touch. */}
          <circle r="48" fill="transparent" />
          {sev ? (
            <circle
              r="40"
              fill="none"
              stroke={SEVERITY_VAR[sev]}
              strokeOpacity={active ? 0.9 : 0.45}
              strokeWidth="2"
            />
          ) : null}
          <circle
            r="30"
            fill={active ? "#fff" : "#0b0b0d"}
            stroke="#fff"
            strokeOpacity={active ? 1 : 0.22}
            className="transition-[fill] duration-200"
          />
          <g transform="translate(-10 -10) scale(4)" className={active ? "text-black" : "text-white"}>
            <NodeGlyph variant={p.node.glyph} />
          </g>
          {sev ? (
            <g transform="translate(26 -26)">
              <circle r="15" fill={SEVERITY_VAR[sev]} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-black font-mono text-[15px] font-semibold"
              >
                {count}
              </text>
            </g>
          ) : null}
          <text
            y="62"
            textAnchor="middle"
            className={clsx(
              "font-mono text-[30px] sm:text-[16px]",
              // On small screens only the active node is labelled, so labels never collide.
              active ? "fill-white" : "fill-[#a7a8b0] max-sm:hidden",
            )}
          >
            {p.node.label}
          </text>
        </g>
      </g>
    </g>
  );
}

/** The dotted node glyph, sized for a 5×5 grid (used inside the scaled node). */
function NodeGlyph({ variant }: { variant: 0 | 1 | 2 | 3 }) {
  const patterns: [number, number][][] = [
    [
      [0, 0],
      [2, 0],
      [4, 0],
      [0, 2],
      [0, 4],
      [2, 4],
      [4, 4],
      [4, 2],
    ],
    [
      [0, 0],
      [4, 0],
      [2, 2],
      [0, 4],
      [4, 4],
    ],
    [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
      [4, 2],
      [2, 4],
      [4, 4],
    ],
    [
      [0, 2],
      [2, 0],
      [2, 2],
      [2, 4],
      [4, 2],
    ],
  ];
  return (
    <g fill="currentColor">
      {patterns[variant].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
      ))}
    </g>
  );
}
