import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

/** Centered content column with the site's standard gutters. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("mx-auto w-full max-w-6xl px-5 sm:px-8", className)} {...props} />;
}

/** Small uppercase label that sits above a section heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "text-signal inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.18em] uppercase",
        className,
      )}
    >
      <span aria-hidden className="bg-signal/70 h-px w-6" />
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
    <div
      className={clsx(
        "flex flex-col gap-4",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="display text-ink text-[clamp(28px,4vw,46px)]">{title}</h2>
      {lede ? (
        <p
          className={clsx(
            "text-muted text-[17px] leading-[27px]",
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
export function Section({
  className,
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <section className={clsx("scroll-mt-20 py-20 sm:py-28", className)} {...props}>
      {children}
    </section>
  );
}

/** A bordered surface card used across feature and trust sections. */
export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={clsx(
        "border-rule bg-raised/60 rounded-lg border p-6 backdrop-blur-sm",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
