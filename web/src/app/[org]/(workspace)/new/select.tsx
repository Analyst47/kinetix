"use client";

import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: LucideIcon;
}

const PANEL =
  "border-rule bg-raised text-ink absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-[min(340px,60vh)] overflow-y-auto overscroll-contain rounded-2xl border p-1.5 shadow-[0_18px_50px_-14px_rgb(0_0_0/0.35)] outline-none animate-[kx-menu-in_0.16s_cubic-bezier(0.2,0.7,0.2,1)_both]";

const TRIGGER =
  "group border-rule-strong/70 bg-raised text-ink hover:border-rule-strong focus-visible:border-ink aria-expanded:border-ink flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-[border-color,box-shadow,transform] duration-150 focus-visible:outline-none active:scale-[0.995] aria-expanded:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ink)_8%,transparent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ink)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-60";

function OptionRow<T extends string>({
  option,
  selected,
  active,
}: {
  option: Option<T>;
  selected: boolean;
  active: boolean;
}) {
  const Icon = option.icon;
  return (
    <>
      {Icon ? (
        <span
          className={clsx(
            "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors",
            selected ? "border-ink bg-ink text-paper" : "border-rule bg-sunken text-muted",
            active && !selected && "text-ink",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13.5px] leading-5 font-medium">{option.label}</span>
        {option.description ? (
          <span className="text-muted text-xs leading-4">{option.description}</span>
        ) : null}
      </span>
      <Check
        aria-hidden
        className={clsx(
          "mt-0.5 size-4 shrink-0 self-start transition-opacity",
          selected ? "opacity-100" : "opacity-0",
        )}
      />
    </>
  );
}

function nextIndex(key: string, at: number, count: number): number | null {
  if (key === "ArrowDown") return Math.min(at + 1, count - 1);
  if (key === "ArrowUp") return Math.max(at - 1, 0);
  if (key === "Home" || key === "PageUp") return 0;
  if (key === "End" || key === "PageDown") return count - 1;
  return null;
}

/**
 * A single-choice dropdown (WAI-ARIA "select-only combobox" pattern: a button that opens a
 * listbox). Arrow keys, Home/End and type-ahead move; Enter or Space chooses; Escape closes.
 * Options can carry an icon and a one-line description.
 */
export function Select<T extends string>({
  id,
  labelId,
  value,
  options,
  onChange,
  renderValue,
  disabled,
}: {
  id: string;
  labelId: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  renderValue?: (option: Option<T>) => ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex]!;

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function show() {
    setActive(selectedIndex);
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function choose(i: number) {
    const option = options[i];
    if (option) onChange(option.value);
    close(true);
  }

  function move(i: number) {
    setActive(i);
    document.getElementById(optionId(i))?.scrollIntoView({ block: "nearest" });
  }

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  }

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    const to = nextIndex(e.key, active, options.length);
    if (to !== null) {
      e.preventDefault();
      move(to);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const ch = e.key.toLowerCase();
      for (let step = 1; step <= options.length; step++) {
        const i = (active + step) % options.length;
        if (options[i]!.label.toLowerCase().startsWith(ch)) {
          move(i);
          break;
        }
      }
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${id}`}
        // While open, keep focus in the list so a click on the trigger simply closes it.
        onMouseDown={(e) => {
          if (open) e.preventDefault();
        }}
        onClick={() => (open ? close(true) : show())}
        onKeyDown={onButtonKey}
        className={TRIGGER}
      >
        {renderValue ? (
          renderValue(selected)
        ) : (
          <>
            {selected.icon ? (
              <span className="border-rule bg-sunken grid size-8 shrink-0 place-items-center rounded-lg border">
                <selected.icon className="size-4" aria-hidden />
              </span>
            ) : null}
            <span key={selected.value} className="kx-fade-up flex min-w-0 flex-1 flex-col">
              <span className="text-[14px] leading-5 font-medium">{selected.label}</span>
              {selected.description ? (
                <span className="text-muted text-xs leading-4">{selected.description}</span>
              ) : null}
            </span>
          </>
        )}
        <ChevronDown
          aria-hidden
          className="text-muted group-hover:text-ink ml-auto size-4 shrink-0 transition-transform duration-200 group-aria-expanded:rotate-180"
        />
      </button>
      {open ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKey}
          onBlur={(e) => {
            if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
          className={PANEL}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={optionId(i)}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()}
              onPointerMove={() => {
                if (i !== active) setActive(i);
              }}
              onClick={() => choose(i)}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 transition-colors duration-100",
                i === active ? "bg-ink/[0.06]" : "bg-transparent",
              )}
            >
              <OptionRow option={o} selected={o.value === value} active={i === active} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * An editable text field with a dropdown of suggestions (WAI-ARIA combobox with a listbox
 * popup). Typing keeps a custom value; ArrowDown opens the list; Enter picks the active one.
 */
export function Combobox({
  id,
  labelId,
  value,
  suggestions,
  onType,
  onPick,
  placeholder,
  inputRef,
  maxLength,
  invalid,
  describedBy,
}: {
  id: string;
  labelId: string;
  value: string;
  suggestions: string[];
  onType: (value: string) => void;
  onPick: (index: number) => void;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  maxLength?: number;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const hasList = suggestions.length > 0;
  const showing = open && hasList;
  const current = suggestions.indexOf(value);

  useEffect(() => {
    if (!showing) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [showing]);

  function show() {
    setActive(current >= 0 ? current : 0);
    setOpen(true);
  }

  function pick(i: number) {
    onPick(i);
    setOpen(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!hasList) return;
    if (!showing) {
      if (e.key === "ArrowDown" || (e.key === "ArrowUp" && e.altKey)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const to = nextIndex(e.key, active, suggestions.length);
    if (to !== null && e.key !== "Home" && e.key !== "End") {
      e.preventDefault();
      setActive(to);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <div
        className={clsx(
          "bg-raised flex h-12 items-center rounded-xl border transition-[border-color,box-shadow] duration-150 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ink)_8%,transparent)]",
          invalid
            ? "border-crit/60 focus-within:border-crit"
            : "border-rule-strong/70 hover:border-rule-strong focus-within:border-ink",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-labelledby={labelId}
          aria-expanded={showing}
          aria-controls={hasList ? listId : undefined}
          aria-autocomplete="none"
          aria-activedescendant={showing ? optionId(active) : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKey}
          onBlur={(e) => {
            if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
          className="text-ink placeholder:text-muted h-full min-w-0 flex-1 bg-transparent px-3.5 text-[15px] font-medium outline-none disabled:cursor-not-allowed"
        />
        {hasList ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={showing ? "Hide name suggestions" : "Show name suggestions"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (showing ? setOpen(false) : show())}
            className="text-muted hover:text-ink hover:bg-ink/[0.06] mr-1.5 grid size-9 place-items-center rounded-lg transition-colors"
          >
            <ChevronDown
              aria-hidden
              className={clsx("size-4 transition-transform duration-200", showing && "rotate-180")}
            />
          </button>
        ) : null}
      </div>
      {showing ? (
        <ul id={listId} role="listbox" aria-labelledby={labelId} className={PANEL}>
          {suggestions.map((s, i) => (
            <li
              key={s}
              id={optionId(i)}
              role="option"
              aria-selected={s === value}
              onMouseDown={(e) => e.preventDefault()}
              onPointerMove={() => {
                if (i !== active) setActive(i);
              }}
              onClick={() => pick(i)}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 transition-colors duration-100",
                i === active ? "bg-ink/[0.06]" : "bg-transparent",
              )}
            >
              <span className="text-muted w-4 font-mono text-[11px]">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{s}</span>
              {i === 0 ? (
                <span className="text-muted font-mono text-[10.5px] tracking-wide">SUGGESTED</span>
              ) : null}
              <Check
                aria-hidden
                className={clsx("size-4 shrink-0", s === value ? "opacity-100" : "opacity-0")}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
