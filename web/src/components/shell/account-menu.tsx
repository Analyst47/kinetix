"use client";

import clsx from "clsx";
import { CreditCard, Keyboard, KeyRound, LogOut, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { unlimitedLabel } from "@/components/usage";
import { call } from "@/lib/client";
import { initials } from "@/lib/format";
import type { Role, Usage } from "@/lib/types";

import { KeyCap, KeyCombo } from "./keys";
import {
  MENU_PANEL,
  MenuButton,
  MenuDivider,
  MenuLink,
  onMenuKeyDown,
  useDismiss,
  useFocusFirstItem,
} from "./menu";
import { ROLE_LABEL } from "./switcher";

function Monogram({ name, size }: { name: string; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "bg-ink text-paper grid shrink-0 place-items-center rounded-full font-semibold tracking-[-0.02em]",
        size === "sm" ? "size-8 text-[11.5px]" : "size-10 text-[13.5px]",
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted font-mono text-[9.5px] font-medium tracking-[0.16em] uppercase">{label}</dt>
      <dd className="truncate text-[12.5px] font-medium">{value}</dd>
    </div>
  );
}

/** The avatar and its menu: who you are, your role and plan, account links and sign out. */
export function AccountMenu({
  user,
  org,
  role,
  usage,
  onShortcuts,
}: {
  user: { name: string; email: string };
  org: string;
  role?: Role;
  usage?: Usage;
  onShortcuts: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, container, trigger);
  useFocusFirstItem(open, menu);

  async function signOut() {
    setLeaving(true);
    await call("POST", "/auth/logout").catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const plan = usage
    ? usage.unlimited
      ? unlimitedLabel(usage)
      : `${usage.plan_name} · ${(usage.searches_remaining ?? 0).toLocaleString("en-US")} left`
    : null;

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        className={clsx(
          "ring-offset-paper grid place-items-center rounded-full ring-offset-2 transition-[box-shadow,scale] duration-200 hover:scale-[1.04]",
          open ? "ring-ink ring-[1.5px]" : "hover:ring-rule-strong ring-transparent hover:ring-[1.5px]",
        )}
      >
        <Monogram name={user.name} size="sm" />
      </button>

      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className={clsx(MENU_PANEL, "top-[calc(100%+10px)] right-0 w-[288px] origin-top-right")}
        >
          <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
            <Monogram name={user.name} size="lg" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-semibold tracking-[-0.01em]">{user.name}</span>
              <span className="text-muted truncate text-[12px]">{user.email}</span>
            </div>
          </div>
          {role || plan ? (
            <dl className="border-rule bg-sunken/60 mx-1 mb-1 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 rounded-xl border px-3 py-2.5">
              {role ? <Fact label="Role" value={ROLE_LABEL[role]} /> : null}
              {plan ? <Fact label="Agentic Triage" value={plan} /> : null}
            </dl>
          ) : null}
          <MenuDivider />
          <MenuLink
            href={`/${org}/billing`}
            icon={CreditCard}
            onSelect={close}
            aside={<KeyCombo keys={["G", "B"]} />}
          >
            Plan & usage
          </MenuLink>
          <MenuLink
            href={`/${org}/settings/ai`}
            icon={Sparkles}
            onSelect={close}
            aside={<KeyCombo keys={["G", "A"]} />}
          >
            AI assistance
          </MenuLink>
          <MenuLink href={`/${org}/settings/security`} icon={KeyRound} onSelect={close}>
            Security
          </MenuLink>
          <MenuButton
            icon={Keyboard}
            onSelect={() => {
              close();
              onShortcuts();
            }}
            aside={<KeyCap>?</KeyCap>}
          >
            Keyboard shortcuts
          </MenuButton>
          <MenuDivider />
          <MenuButton icon={LogOut} onSelect={signOut}>
            {leaving ? "Signing out…" : "Sign out"}
          </MenuButton>
        </div>
      ) : null}
    </div>
  );
}
