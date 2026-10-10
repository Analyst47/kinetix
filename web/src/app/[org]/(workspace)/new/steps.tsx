import clsx from "clsx";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

export type StepStatus = "done" | "current" | "upcoming";

function StepNode({ n, status, delay }: { n: number; status: StepStatus; delay: number }) {
  return (
    <span className="relative z-10 grid size-8 shrink-0 place-items-center">
      {status === "current" ? (
        <span aria-hidden className="kx-pulse-ring border-ink absolute inset-0 rounded-full border" />
      ) : null}
      {status === "done" ? (
        <span
          key="done"
          className="bg-brand text-on-brand grid size-8 animate-[kx-pop_0.42s_cubic-bezier(0.34,1.56,0.64,1)_both] place-items-center rounded-full"
          style={{ animationDelay: `${delay}ms` }}
        >
          <Check className="size-4" strokeWidth={2.75} aria-hidden />
        </span>
      ) : (
        <span
          key="todo"
          className={clsx(
            "bg-paper grid size-8 place-items-center rounded-full border font-mono text-[12px] font-medium transition-colors duration-300",
            status === "current" ? "border-ink text-ink" : "border-rule-strong text-muted border-dashed",
          )}
        >
          {n}
        </span>
      )}
    </span>
  );
}

/**
 * One step of the flow, on a vertical rail. The rail segment below a finished step traces
 * down in ink (staggered by `delay`, so a pasted link fills the whole path in a cascade).
 */
export function Step({
  n,
  id,
  title,
  hint,
  status,
  last,
  delay = 0,
  aside,
  locked,
  children,
}: {
  n: number;
  id: string;
  title: string;
  hint?: ReactNode;
  status: StepStatus;
  last?: boolean;
  delay?: number;
  aside?: ReactNode;
  locked?: boolean;
  children?: ReactNode;
}) {
  const done = status === "done";
  return (
    <section
      aria-labelledby={id}
      className={clsx(
        // An open dropdown inside lifts the whole step above later steps and the action dock.
        "relative grid grid-cols-[32px_minmax(0,1fr)] gap-x-4 transition-opacity duration-300 has-[[aria-expanded=true]]:z-30 sm:gap-x-6",
        locked && "opacity-55",
      )}
    >
      <div className="relative flex flex-col items-center" aria-hidden={locked || undefined}>
        <StepNode n={n} status={status} delay={delay} />
        {!last ? (
          <span className="bg-rule relative my-2 w-px flex-1 overflow-hidden rounded-full">
            <span
              className="bg-ink absolute inset-0 origin-top transition-transform duration-500 ease-out"
              style={{
                transform: `scaleY(${done ? 1 : 0})`,
                transitionDelay: done ? `${delay + 140}ms` : "0ms",
              }}
            />
          </span>
        ) : null}
      </div>
      <div className={clsx("min-w-0", last ? "pb-1" : locked ? "pb-7" : "pb-10")}>
        <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
          <h2
            id={id}
            className={clsx(
              "text-[15.5px] leading-6 font-semibold tracking-[-0.01em]",
              locked ? "text-muted" : "text-ink",
            )}
          >
            <span className="sr-only">Step {n}: </span>
            {title}
          </h2>
          {aside}
        </div>
        {hint ? <p className="text-muted mt-0.5 text-[13px] leading-5">{hint}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </section>
  );
}

/** A small uppercase label for a control inside a step. */
export function ControlLabel({
  id,
  htmlFor,
  children,
  aside,
}: {
  id?: string;
  htmlFor?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const cls = "text-muted font-mono text-[10.5px] font-medium tracking-[0.14em] uppercase";
  return (
    <div className="mb-2 flex items-center gap-2">
      {htmlFor ? (
        <label id={id} htmlFor={htmlFor} className={cls}>
          {children}
        </label>
      ) : (
        <span id={id} className={cls}>
          {children}
        </span>
      )}
      {aside ? <span className="ml-auto">{aside}</span> : null}
    </div>
  );
}
