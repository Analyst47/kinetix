"use client";

import clsx from "clsx";
import { ArrowRight, ArrowUpRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

import { StarField } from "@/components/sky";
import { ButtonLink } from "@/components/ui";
import { AUTHORIZATION_LABEL, SEVERITY_LABEL, SEVERITY_ORDER } from "@/lib/format";
import type { Project } from "@/lib/types";

import { useHydrated, useReducedMotion } from "./hooks";
import { IdenticonCells } from "./identicon";
import {
  SEVERITY_FILL,
  TIER_LABEL,
  byRisk,
  countsOf,
  formatDay,
  openOf,
  reviewOf,
  reviewPhrase,
  sumCounts,
  tierOf,
  topSeverityOf,
  truncate,
  type Tier,
} from "./lib";

/* ── Layout ─────────────────────────────────────────────────────────────────────────────── */

interface Orbit {
  radius: number;
  tier: Tier;
  /** Degrees per second; the sign sets the direction. */
  speed: number;
  projects: Project[];
}

interface Placed {
  project: Project;
  orbit: number;
  x: number;
  y: number;
}

const INNER = 150;
const OUTER = 392;

function radii(n: number): number[] {
  if (n === 1) return [255];
  return Array.from({ length: n }, (_, i) => INNER + ((OUTER - INNER) * i) / (n - 1));
}

/**
 * Put each project on a ring by risk: open critical findings innermost, then high, then the
 * rest. A tier that outgrows its ring spills onto the next one out, adding rings as needed.
 */
function layout(projects: Project[], gap: number): Orbit[] {
  const tiers: Project[][] = [[], [], []];
  for (const p of [...projects].sort(byRisk)) tiers[tierOf(p)].push(p);
  const present = ([0, 1, 2] as Tier[]).filter((t) => tiers[t].length > 0);
  let best: Orbit[] = [];
  for (let count = present.length; count <= 6; count++) {
    const rs = radii(count);
    const out: Orbit[] = [];
    let ri = 0;
    let fits = true;
    for (const tier of present) {
      const queue = [...tiers[tier]];
      while (queue.length) {
        if (ri >= rs.length) {
          fits = false;
          break;
        }
        const capacity = Math.max(1, Math.floor((2 * Math.PI * rs[ri]) / gap));
        out.push({ radius: rs[ri], tier, speed: 0, projects: queue.splice(0, capacity) });
        ri++;
      }
      if (!fits) break;
    }
    best = out;
    if (fits) break;
  }
  // Inner rings turn a little faster; neighbours turn opposite ways.
  return best.map((o, i) => ({ ...o, speed: (i % 2 === 0 ? 1 : -1) * Math.max(1.1, 3.2 - i * 0.55) }));
}

function place(orbits: Orbit[]): Placed[] {
  return orbits.flatMap((o, oi) =>
    o.projects.map((project, i) => {
      // Offset each ring so nodes on neighbouring rings don't line up on one spoke.
      const a = ((i / o.projects.length) * 360 + oi * 41 - 90) * (Math.PI / 180);
      return { project, orbit: oi, x: Math.cos(a) * o.radius, y: Math.sin(a) * o.radius };
    }),
  );
}

/* ── Radar ──────────────────────────────────────────────────────────────────────────────── */

/**
 * The workspace attack-surface radar: the workspace at the centre and every project orbiting
 * it on a ring by risk, badged with its open findings. Hovering or focusing a project pauses
 * the orbit and opens its details in the side panel; clicking opens its findings.
 *
 * It sits on a pinned black (`.night`) card so it reads the same in light and dark themes.
 * Motion is imperative (one transform per ring per frame) so React never re-renders on the
 * animation loop, and it stops for reduced motion, off-screen, and in hidden tabs.
 */
export function WorkspaceRadar({
  org,
  orgName,
  projects,
  now,
  highlight,
  onHighlight,
}: {
  org: string;
  orgName: string;
  projects: Project[];
  now: number;
  /** A project highlighted from elsewhere on the page (a hovered card). */
  highlight: string | null;
  onHighlight: (slug: string | null) => void;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const scale = projects.length > 16 ? 0.74 : projects.length > 10 ? 0.86 : 1;
  const orbits = useMemo(() => layout(projects, 104 * scale), [projects, scale]);
  const placed = useMemo(() => place(orbits), [orbits]);
  const bySlug = useMemo(() => new Map(placed.map((p) => [p.project.slug, p])), [placed]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const activeSlug = hovered ?? highlight ?? pinned;
  const active = activeSlug ? bySlug.get(activeSlug) : undefined;

  const root = useRef<HTMLElement>(null);
  const ringEls = useRef<(SVGGElement | null)[]>([]);
  const uprightEls = useRef<Map<string, SVGGElement>>(new Map());
  const sweepEl = useRef<SVGGElement>(null);
  const angles = useRef<number[]>([]);
  const sweep = useRef(0);
  const paused = useRef(false);
  // How the current press started: a tap on a node that wasn't already inspected only inspects it.
  const press = useRef<{ slug: string; touch: boolean; wasActive: boolean } | null>(null);

  useEffect(() => {
    paused.current = hovered !== null || highlight !== null;
  }, [hovered, highlight]);

  const apply = useCallback(() => {
    orbits.forEach((_, oi) => {
      const deg = angles.current[oi] ?? 0;
      ringEls.current[oi]?.setAttribute("transform", `rotate(${deg.toFixed(3)})`);
    });
    for (const p of placed) {
      const deg = angles.current[p.orbit] ?? 0;
      uprightEls.current.get(p.project.slug)?.setAttribute("transform", `rotate(${(-deg).toFixed(3)})`);
    }
    sweepEl.current?.setAttribute("transform", `rotate(${sweep.current.toFixed(2)})`);
  }, [orbits, placed]);

  // Paint the current angles before the browser does whenever the layout changes. Angles carry
  // over a data refresh, so the orbit doesn't jump when the page re-renders.
  useLayoutEffect(() => {
    apply();
  }, [apply]);

  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    if (root.current) io.observe(root.current);
    const tick = (t: number) => {
      const dt = Math.min(64, t - last) / 1000;
      last = t;
      if (visible && !document.hidden) {
        sweep.current = (sweep.current + dt * 20) % 360;
        if (!paused.current) {
          angles.current = orbits.map((o, i) => ((angles.current[i] ?? 0) + o.speed * dt) % 360);
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
  }, [reduceMotion, orbits, apply]);

  const hover = (slug: string | null) => {
    setHovered(slug);
    if (slug) setPinned(slug);
    onHighlight(slug);
  };

  const onPress = (e: ReactPointerEvent, slug: string) => {
    press.current = { slug, touch: e.pointerType !== "mouse", wasActive: activeSlug === slug };
  };

  const open = (e: ReactMouseEvent, slug: string, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const p = press.current;
    press.current = null;
    // Touch has no hover: the first tap inspects a project, the second opens it. Keyboard
    // activation (detail 0) and mouse clicks open straight away.
    if (e.detail !== 0 && p?.slug === slug && p.touch && !p.wasActive) {
      setPinned(slug);
      onHighlight(null);
      return;
    }
    router.push(href);
  };

  const totals = useMemo(() => sumCounts(projects), [projects]);
  const totalOpen = SEVERITY_ORDER.reduce((n, s) => n + totals[s], 0);
  const hasCritical = totals.critical > 0;

  return (
    <section
      ref={root}
      aria-labelledby="radar-title"
      className="night border-rule relative isolate overflow-hidden rounded-3xl border"
    >
      <StarField density={0.5} />
      <div className="relative grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="radar-title" className="eyebrow text-ink">
              Attack-surface radar
            </h2>
            <span className="text-muted font-mono text-[11px] tracking-[0.12em] uppercase">
              Open findings from static analysis
            </span>
          </div>

          <svg
            viewBox="-500 -500 1000 1000"
            className="relative mx-auto block aspect-square w-full max-w-[640px] select-none"
            role="group"
            aria-label={`${orgName}: ${projects.length} project${projects.length === 1 ? "" : "s"} on rings by risk, ${totalOpen} open findings`}
            onMouseLeave={() => hover(null)}
          >
            <defs>
              <linearGradient id="kx-ws-sweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {/* Instrument bezel: a tick every 5°, longer every 30°. */}
            <g stroke="#fff" aria-hidden>
              {Array.from({ length: 72 }, (_, i) => {
                const a = (i * 5 * Math.PI) / 180;
                const major = i % 6 === 0;
                const r1 = major ? 452 : 460;
                return (
                  <line
                    key={i}
                    x1={(Math.cos(a) * r1).toFixed(1)}
                    y1={(Math.sin(a) * r1).toFixed(1)}
                    x2={(Math.cos(a) * 470).toFixed(1)}
                    y2={(Math.sin(a) * 470).toFixed(1)}
                    strokeOpacity={major ? 0.28 : 0.1}
                  />
                );
              })}
            </g>

            {/* Rings by risk tier (the legend is in the side panel; labels here would sit under orbiting nodes). */}
            {orbits.map((o) => (
              <circle
                key={o.radius}
                r={o.radius}
                fill="none"
                stroke="#fff"
                strokeOpacity={o.tier === 0 ? 0.22 : 0.13}
                strokeDasharray={o.tier === 2 ? "3 7" : undefined}
              />
            ))}

            {/* A slow radar sweep: a faint wedge trailing a hairline. */}
            {!reduceMotion ? (
              <g ref={sweepEl} aria-hidden>
                <path d="M0 0 L470 0 A470 470 0 0 0 407 -235 Z" fill="url(#kx-ws-sweep)" />
                <line x1="0" y1="0" x2="470" y2="0" stroke="#fff" strokeOpacity="0.14" />
              </g>
            ) : null}

            {/* The projects, one rotating group per ring. */}
            {orbits.map((o, oi) => {
              const spacing = (2 * Math.PI * o.radius) / Math.max(1, o.projects.length);
              const roomy = spacing >= 150 * scale;
              return (
                <g key={o.radius} ref={(el) => void (ringEls.current[oi] = el)}>
                  {placed
                    .filter((p) => p.orbit === oi)
                    .map((p) => (
                      <ProjectNode
                        key={p.project.slug}
                        org={org}
                        p={p}
                        scale={scale}
                        labelled={roomy}
                        active={p.project.slug === activeSlug}
                        animate={!reduceMotion}
                        uprightRef={(el) => {
                          if (el) uprightEls.current.set(p.project.slug, el);
                          else uprightEls.current.delete(p.project.slug);
                        }}
                        onHover={hover}
                        onFocus={hover}
                        onPress={onPress}
                        onOpen={open}
                      />
                    ))}
                </g>
              );
            })}

            {/* The workspace at the centre. */}
            <g aria-hidden>
              {!reduceMotion ? (
                <circle
                  r="62"
                  fill="none"
                  stroke="#fff"
                  strokeOpacity={hasCritical ? 0.45 : 0.25}
                  className="kx-pulse-ring origin-center [transform-box:fill-box]"
                />
              ) : null}
              <circle
                r="84"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.16"
                strokeDasharray="1 9"
                strokeLinecap="round"
                className="kx-spin-slow origin-center [transform-box:fill-box]"
              />
              <circle r="62" fill="#000" stroke="#fff" strokeOpacity="0.55" />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                y="-6"
                className="fill-white font-sans text-[44px] font-semibold tracking-[-0.04em]"
              >
                {orgName.trim().slice(0, 1).toUpperCase() || "W"}
              </text>
              <text
                textAnchor="middle"
                y="34"
                className="fill-[#8f8f99] font-mono text-[14px] tracking-[0.16em] uppercase max-sm:hidden"
              >
                {truncate(orgName, 12)}
              </text>
            </g>
          </svg>

          <p className="text-muted font-mono text-[11px] tracking-[0.12em] uppercase">
            Hover or focus a project to inspect it · click to open its findings
          </p>
        </div>

        <RadarPanel
          org={org}
          orgName={orgName}
          orbits={orbits}
          totalOpen={totalOpen}
          projectCount={projects.length}
          active={active?.project ?? null}
          activeTier={active ? orbits[active.orbit]?.tier : undefined}
          now={now}
          onClear={() => {
            setPinned(null);
            setHovered(null);
            onHighlight(null);
          }}
        />
      </div>
    </section>
  );
}

/* ── Node ───────────────────────────────────────────────────────────────────────────────── */

function ProjectNode({
  org,
  p,
  scale,
  labelled,
  active,
  animate,
  uprightRef,
  onHover,
  onFocus,
  onPress,
  onOpen,
}: {
  org: string;
  p: Placed;
  scale: number;
  labelled: boolean;
  active: boolean;
  animate: boolean;
  uprightRef: (el: SVGGElement | null) => void;
  onHover: (slug: string | null) => void;
  onFocus: (slug: string | null) => void;
  onPress: (e: ReactPointerEvent, slug: string) => void;
  onOpen: (e: ReactMouseEvent, slug: string, href: string) => void;
}) {
  const { project } = p;
  const sev = topSeverityOf(project);
  const open = openOf(project);
  const href = `/${org}/${project.slug}/findings`;
  const critical = countsOf(project).critical > 0;
  return (
    <g>
      {/* The spoke to the centre, in this ring's rotating frame. */}
      {active ? (
        <line
          x1={0}
          y1={0}
          x2={p.x.toFixed(1)}
          y2={p.y.toFixed(1)}
          stroke="#fff"
          strokeOpacity="0.35"
          strokeDasharray="3 6"
        />
      ) : null}
      <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
        <g ref={uprightRef}>
          <g transform={scale === 1 ? undefined : `scale(${scale})`}>
            <a
              href={href}
              aria-label={`${project.name}: ${open ? `${open} open finding${open === 1 ? "" : "s"}` : "no open findings"}`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => onHover(project.slug)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onFocus(project.slug)}
              onBlur={() => onFocus(null)}
              onPointerDown={(e) => onPress(e, project.slug)}
              onClick={(e) => onOpen(e, project.slug, href)}
            >
              {/* Generous invisible hit area for touch. */}
              <circle r="50" fill="transparent" />
              {critical && animate ? (
                <circle
                  r="38"
                  fill="none"
                  stroke={SEVERITY_FILL.critical}
                  strokeWidth="1.5"
                  className="kx-pulse-ring origin-center [transform-box:fill-box]"
                />
              ) : null}
              {sev ? (
                <circle
                  r="39"
                  fill="none"
                  stroke={sev === "info" ? "#8f8f99" : SEVERITY_FILL[sev]}
                  strokeOpacity={active ? 0.95 : 0.5}
                  strokeWidth="2"
                  className="transition-[stroke-opacity] duration-200"
                />
              ) : null}
              <circle
                r="29"
                fill={active ? "#fff" : "#0b0b0d"}
                stroke="#fff"
                strokeOpacity={active ? 1 : sev ? 0.28 : 0.16}
                className="transition-[fill] duration-200"
              />
              <g
                transform="translate(-11 -11) scale(4.4)"
                className={clsx(
                  "transition-colors duration-200",
                  active ? "text-black" : sev ? "text-white" : "text-[#8f8f99]",
                )}
              >
                <IdenticonCells seed={project.slug} />
              </g>
              {sev ? (
                <g transform="translate(26 -26)">
                  <circle r={open > 99 ? 19 : 16} fill={sev === "info" ? "#8f8f99" : SEVERITY_FILL[sev]} />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={clsx(
                      "fill-black font-mono font-semibold",
                      open > 99 ? "text-[12.5px]" : "text-[15px]",
                    )}
                  >
                    {open > 999 ? "999+" : open}
                  </text>
                </g>
              ) : null}
              <text
                y="62"
                textAnchor="middle"
                className={clsx(
                  "pointer-events-none font-mono text-[30px] sm:text-[17px]",
                  active ? "fill-white" : "fill-[#a7a8b0] max-sm:hidden",
                  !active && !labelled && "hidden",
                )}
              >
                {truncate(project.name, 18)}
              </text>
            </a>
          </g>
        </g>
      </g>
    </g>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────────────────────────── */

function RadarPanel({
  org,
  orgName,
  orbits,
  totalOpen,
  projectCount,
  active,
  activeTier,
  now,
  onClear,
}: {
  org: string;
  orgName: string;
  orbits: Orbit[];
  totalOpen: number;
  projectCount: number;
  active: Project | null;
  activeTier: Tier | undefined;
  now: number;
  onClear: () => void;
}) {
  return (
    <aside
      aria-live="polite"
      className="border-rule bg-raised/70 flex min-h-[380px] flex-col gap-5 border-t p-5 backdrop-blur-[2px] sm:p-6 lg:border-t-0 lg:border-l"
    >
      {active ? (
        <ProjectDetail
          key={active.slug}
          org={org}
          project={active}
          tier={activeTier}
          now={now}
          onClear={onClear}
        />
      ) : (
        <Overview orgName={orgName} orbits={orbits} totalOpen={totalOpen} projectCount={projectCount} />
      )}
    </aside>
  );
}

function Overview({
  orgName,
  orbits,
  totalOpen,
  projectCount,
}: {
  orgName: string;
  orbits: Orbit[];
  totalOpen: number;
  projectCount: number;
}) {
  const perTier = ([0, 1, 2] as Tier[]).map((t) => ({
    tier: t,
    count: orbits.filter((o) => o.tier === t).reduce((n, o) => n + o.projects.length, 0),
  }));
  const tierColor: Record<Tier, string> = { 0: "var(--crit)", 1: "var(--high)", 2: "var(--rule-strong)" };
  return (
    <div className="kx-fade-up flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow text-muted text-[10.5px]">Workspace</span>
        <h3 className="display text-ink text-[26px] break-words">{orgName}</h3>
        <p className="text-muted text-[14px]">
          {projectCount} project{projectCount === 1 ? "" : "s"} in orbit · {totalOpen.toLocaleString("en-US")}{" "}
          open finding{totalOpen === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {perTier.map(({ tier, count }) => (
          <li key={tier} className="flex items-center gap-3 text-[13.5px]">
            <RingGlyph tier={tier} />
            <span className="text-ink">{TIER_LABEL[tier]}</span>
            <span
              aria-hidden
              className="ml-auto size-2 rounded-full"
              style={{ background: count ? tierColor[tier] : "transparent" }}
            />
            <span className="text-ink w-6 text-right font-medium">{count}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted text-[13px] leading-[20px]">
        Projects with open critical findings orbit closest to the centre. Hover, focus or tap one to see its
        breakdown.
      </p>
      <p className="border-rule text-muted mt-auto border-t pt-4 text-[12.5px] leading-[19px]">
        Counts are open findings from read-only static analysis of code you&apos;re authorized to assess. A
        researcher validates every one.
      </p>
    </div>
  );
}

/** A tiny three-ring glyph with the tier's ring drawn solid. */
function RingGlyph({ tier }: { tier: Tier }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
      {[4, 7, 9.5].map((r, i) => (
        <circle
          key={r}
          cx="10"
          cy="10"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={i === tier ? 1 : 0.25}
          strokeWidth={i === tier ? 1.5 : 1}
        />
      ))}
    </svg>
  );
}

function ProjectDetail({
  org,
  project,
  tier,
  now,
  onClear,
}: {
  org: string;
  project: Project;
  tier: Tier | undefined;
  now: number;
  onClear: () => void;
}) {
  const counts = countsOf(project);
  const open = openOf(project);
  const review = reviewOf(project, now);
  const hydrated = useHydrated();
  const base = `/${org}/${project.slug}`;
  return (
    <div className="kx-fade-up flex flex-1 flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="border-rule-strong text-ink grid size-10 shrink-0 place-items-center rounded-full border">
          <svg viewBox="-0.5 -0.5 6 6" className="size-[18px]" aria-hidden>
            <IdenticonCells seed={project.slug} />
          </svg>
        </span>
        <span className="eyebrow text-muted min-w-0 truncate text-[10.5px]">
          {tier !== undefined
            ? `${["Inner", "Middle", "Outer"][tier]} ring · ${TIER_LABEL[tier]}`
            : "Project"}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Back to workspace overview"
          className="text-muted hover:text-ink hover:bg-ink/[0.08] ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-full"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="display text-ink text-[26px] break-words">{project.name}</h3>
        <p className="mono text-muted">{project.slug}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="display text-ink text-[36px] leading-none">{open.toLocaleString("en-US")}</span>
          <span className="text-muted text-[13px]">open finding{open === 1 ? "" : "s"}</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          {SEVERITY_ORDER.map((s) =>
            counts[s] ? (
              <span
                key={s}
                className="h-full"
                style={{ width: `${(counts[s] / Math.max(1, open)) * 100}%`, background: SEVERITY_FILL[s] }}
              />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {SEVERITY_ORDER.filter((s) => s !== "info" || counts.info > 0).map((s) => (
            <span key={s} className="text-muted flex items-center gap-1.5 text-[12.5px]">
              <span className="size-2 rounded-full" style={{ background: SEVERITY_FILL[s] }} />
              {SEVERITY_LABEL[s]}
              <span className="text-ink font-medium">{counts[s]}</span>
            </span>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <dt className="text-muted">Authorization</dt>
        <dd className="text-ink">
          {AUTHORIZATION_LABEL[project.authorization_type] ?? project.authorization_type}
        </dd>
        <dt className="text-muted">Review by</dt>
        <dd className="text-ink">
          {review.kind === "none" ? (
            "No expiry set"
          ) : (
            <>
              <time dateTime={review.at}>{formatDay(review.at, hydrated)}</time>{" "}
              <span
                className={clsx(
                  review.kind === "expired" && "text-crit",
                  review.kind === "soon" && "text-med",
                  review.kind === "ok" && "text-muted",
                )}
              >
                · {reviewPhrase(review)}
              </span>
            </>
          )}
        </dd>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2">
        <ButtonLink variant="primary" href={`${base}/findings`}>
          Findings
          <ArrowRight aria-hidden />
        </ButtonLink>
        <ButtonLink href={`${base}/scans`}>
          Scans
          <ArrowUpRight aria-hidden />
        </ButtonLink>
        <ButtonLink href={`${base}/scope`}>
          Scope
          <ArrowUpRight aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}
