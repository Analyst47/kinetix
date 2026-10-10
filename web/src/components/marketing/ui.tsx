import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

import { Sky as PageSky } from "@/components/sky";

/** Centered content column with the site's standard gutters. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("mx-auto w-full max-w-7xl px-4 sm:px-8", className)} {...props} />;
}

/** Small uppercase mono label that sits above a section heading. */
export function Eyebrow({
  children,
  className,
  boxed,
}: {
  children: ReactNode;
  className?: string;
  boxed?: boolean;
}) {
  return (
    <span
      className={clsx(
        "eyebrow inline-flex items-center gap-2",
        boxed ? "border-rule-strong text-ink rounded-full border px-3 py-1.5" : "text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-4", align === "center" && "items-center text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="display text-ink text-[clamp(30px,4.4vw,54px)]">{title}</h2>
      {lede ? (
        <p
          className={clsx(
            "text-muted text-[16.5px] leading-[26px]",
            align === "center" ? "max-w-[60ch]" : "max-w-[62ch]",
          )}
        >
          {lede}
        </p>
      ) : null}
    </div>
  );
}

/** Vertical rhythm wrapper for a marketing section. */
export function Section({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={clsx("relative scroll-mt-20 py-20 sm:py-28", className)} {...props}>
      {children}
    </section>
  );
}

/** A flat, bordered surface used across feature and trust sections. */
export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={clsx("border-rule bg-raised/50 rounded-2xl border p-6", className)} {...props}>
      {children}
    </div>
  );
}

/** A large stat: number on top, uppercase mono caption beneath. */
export function Stat({
  value,
  label,
  icon,
  className,
}: {
  value: ReactNode;
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("border-rule flex flex-col gap-3 border-t pt-5", className)}>
      <div className="flex items-center gap-3">
        {icon ? <span className="text-muted">{icon}</span> : null}
        <span className="display text-ink text-[clamp(34px,4vw,52px)] leading-none">{value}</span>
      </div>
      <span className="eyebrow text-muted">{label}</span>
    </div>
  );
}

/** Square dotted glyph used as a quiet icon next to stats and list items. */
export function DotGlyph({ variant = 0, className }: { variant?: 0 | 1 | 2 | 3; className?: string }) {
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
    <svg
      aria-hidden
      viewBox="-0.5 -0.5 5 5"
      className={clsx("size-4 shrink-0", className)}
      fill="currentColor"
    >
      {patterns[variant].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
      ))}
    </svg>
  );
}

/** The top of an inner marketing page: eyebrow, large headline and lede over the night sky. */
export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative -mt-16 overflow-hidden pt-16">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <PageSky />
      </div>
      <Container className="relative flex flex-col items-start gap-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <Eyebrow boxed>{eyebrow}</Eyebrow>
        <h1 className="display text-ink max-w-[18ch] text-[clamp(40px,6.4vw,84px)]">{title}</h1>
        {lede ? (
          <p className="text-ink/70 max-w-[60ch] text-[clamp(16px,1.3vw,18.5px)] leading-[1.6]">{lede}</p>
        ) : null}
        {children}
      </Container>
    </section>
  );
}
