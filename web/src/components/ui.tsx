import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { SEVERITY_COLOR, SEVERITY_LABEL, STATUS_LABEL, initials } from "@/lib/format";
import type { FindingStatus, Severity } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0";

const BUTTON_VARIANT: Record<Variant, string> = {
  primary:
    "border-vg bg-vg text-on-vg hover:brightness-110 disabled:border-rule disabled:bg-sunken disabled:text-muted disabled:hover:brightness-100",
  secondary: "border-rule-strong bg-raised text-ink hover:bg-paper disabled:text-muted",
  ghost: "border-transparent bg-transparent text-ink hover:bg-rule disabled:text-muted",
  danger: "border-rule-strong bg-raised text-crit hover:bg-crit-soft",
};

export function buttonClass(variant: Variant = "secondary", className?: string) {
  return clsx(BUTTON_BASE, BUTTON_VARIANT[variant], className);
}

export function Button({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Panel({
  title,
  aside,
  children,
  className,
  ...rest
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"section">, "title">) {
  return (
    <section className={clsx("border-rule bg-raised rounded-md border", className)} {...rest}>
      {title ? (
        <header className="border-rule flex items-center gap-2 border-b px-4 py-3">
          <h2 className="text-[15px] leading-[22px] font-semibold">{title}</h2>
          {aside ? <div className="ml-auto flex items-center gap-2">{aside}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function SeverityMark({ severity, count }: { severity: Severity; count?: number }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 text-xs leading-4 font-semibold whitespace-nowrap",
        SEVERITY_COLOR[severity],
      )}
    >
      <span aria-hidden className="h-4 w-[3px] rounded-sm bg-current" />
      {SEVERITY_LABEL[severity]}
      {count !== undefined ? <span className="text-ink font-medium">{count}</span> : null}
    </span>
  );
}

const OPEN_STATES: FindingStatus[] = ["discovered", "triage", "needs_validation"];
const CLOSED_STATES: FindingStatus[] = [
  "false_positive",
  "duplicate",
  "not_a_security_issue",
  "out_of_scope",
];

export function StatusLabel({ status }: { status: FindingStatus }) {
  const open = OPEN_STATES.includes(status);
  const closed = CLOSED_STATES.includes(status);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 text-[13px] whitespace-nowrap",
        open && "text-muted",
        closed && "text-muted line-through",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "size-[9px] shrink-0 rounded-full",
          open && "border-muted border-[1.5px] border-dashed",
          closed && "border-muted border-[1.5px]",
          !open && !closed && status === "confirmed" && "bg-ink",
          !open && !closed && status !== "confirmed" && "bg-vg",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      title={name}
      aria-label={name}
      className={clsx(
        "border-rule bg-sunken text-ink inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Chip({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        "border-rule bg-raised text-ink inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-rule bg-paper text-muted rounded-sm border px-1.5 py-px font-mono text-[11px]">
      {children}
    </kbd>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="mr-auto flex min-w-0 flex-col gap-0.5">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">{title}</h1>
        {description ? <p className="text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-6 py-10">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {children ? <p className="text-muted max-w-[60ch]">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-crit text-xs" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-8 w-full rounded-sm border border-rule-strong bg-raised px-2.5 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-0";

export const textareaClass =
  "w-full rounded-sm border border-rule-strong bg-raised px-2.5 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-0";

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="border-crit/40 bg-crit-soft text-crit rounded-sm border px-3 py-2 text-[13px]">
      {children}
    </p>
  );
}
