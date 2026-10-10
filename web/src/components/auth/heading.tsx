import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** A small live dot: a solid core with one slow ripple. */
export function LiveDot() {
  return (
    <span aria-hidden className="relative grid size-2 place-items-center">
      <span className="bg-ink size-1.5 rounded-full" />
      <span className="kx-pulse-ring border-ink absolute inset-0 rounded-full border opacity-0" />
    </span>
  );
}

/**
 * The heading block for a sign-in page: an eyebrow with a live dot, a tight display title with
 * an optional muted tail (the landing page's rhythm), and a lede.
 */
export function AuthHeading({
  eyebrow,
  title,
  tail,
  lede,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  tail?: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow text-muted inline-flex items-center gap-2.5 text-[10.5px]">
        <LiveDot />
        {eyebrow}
      </span>
      <h1 className="display text-ink text-[clamp(30px,3.6vw,38px)] text-balance">
        {title}
        {tail ? <span className="text-muted"> {tail}</span> : null}
      </h1>
      {lede ? <p className="text-muted text-[14.5px] leading-[22px]">{lede}</p> : null}
    </div>
  );
}

/** The "New here? / Already have an account?" row at the foot of a sign-in card. */
export function AuthSwitch({ prompt, href, label }: { prompt: ReactNode; href: string; label: ReactNode }) {
  return (
    <p className="border-rule text-muted flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-5 text-[13.5px]">
      <span>{prompt}</span>
      <Link href={href} className="group text-ink inline-flex items-center gap-1 font-medium">
        {label}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
        />
      </Link>
    </p>
  );
}
