"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";

/** Close a popover on an outside pointer press or Escape (Escape also returns focus to `trigger`). */
export function useDismiss(
  open: boolean,
  close: () => void,
  container: RefObject<HTMLElement | null>,
  trigger?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (container.current && !container.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      trigger?.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, container, trigger]);
}

/** Focus the first item of a menu that just opened. */
export function useFocusFirstItem(open: boolean, menu: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, menu]);
}

/** Arrow-key, Home and End movement between the items of a role="menu". */
export function onMenuKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  if (items.length === 0) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? items.length - 1
        : e.key === "ArrowDown"
          ? (at + 1) % items.length
          : (at - 1 + items.length) % items.length;
  items[next]?.focus();
}

export const MENU_PANEL =
  "border-rule bg-raised text-ink absolute z-40 flex flex-col rounded-2xl border p-1.5 shadow-[0_18px_50px_-14px_rgb(0_0_0/0.35)] animate-[kx-menu-in_0.16s_cubic-bezier(0.2,0.7,0.2,1)_both]";

const MENU_ITEM =
  "group/item flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13.5px] outline-none transition-colors hover:bg-ink/[0.06] focus-visible:bg-ink/[0.07]";

function ItemBody({
  icon: Icon,
  children,
  aside,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <>
      {Icon ? (
        <Icon
          className="text-muted group-hover/item:text-ink size-4 shrink-0 transition-[color,rotate] duration-200 group-hover/item:-rotate-6"
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {aside ? (
        <span className="text-muted ml-auto flex shrink-0 items-center gap-1.5 text-xs">{aside}</span>
      ) : null}
    </>
  );
}

export function MenuLink({
  href,
  icon,
  children,
  aside,
  onSelect,
  className,
}: {
  href: string;
  icon?: LucideIcon;
  children: ReactNode;
  aside?: ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <Link role="menuitem" href={href} onClick={onSelect} className={clsx(MENU_ITEM, className)}>
      <ItemBody icon={icon} aside={aside}>
        {children}
      </ItemBody>
    </Link>
  );
}

export function MenuButton({
  icon,
  children,
  aside,
  onSelect,
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  aside?: ReactNode;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button type="button" role="menuitem" onClick={onSelect} className={clsx(MENU_ITEM, className)}>
      <ItemBody icon={icon} aside={aside}>
        {children}
      </ItemBody>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted px-2.5 pt-2 pb-1 font-mono text-[10px] font-medium tracking-[0.16em] uppercase">
      {children}
    </p>
  );
}

export function MenuDivider() {
  return <div role="separator" className="bg-rule mx-1 my-1.5 h-px" />;
}
