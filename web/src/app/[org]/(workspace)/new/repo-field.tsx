"use client";

import clsx from "clsx";
import {
  Archive,
  ArrowRight,
  Check,
  CircleAlert,
  ClipboardPaste,
  GitBranch,
  Sparkles,
  X,
} from "lucide-react";
import type { ClipboardEvent, KeyboardEvent, Ref } from "react";

import type { RepoCheck } from "./repo";

/** The GitHub mark (Octicons "mark-github"), drawn in currentColor. */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Deliberately vulnerable training apps: safe, public targets to try the flow on. */
const EXAMPLES = ["juice-shop/juice-shop", "OWASP/NodeGoat"];

export type UrlSource = "type" | "paste" | "example" | "fix" | "clear";

/**
 * The hero field: one large, paste-friendly repository URL input. Validates as you type with
 * the API's own rules, offers a one-click fix for near misses (SSH remotes, http://, deep
 * links, query strings) and shows the parsed owner/repo once the link is usable.
 */
export function RepoField({
  id,
  label,
  value,
  check,
  touched,
  note,
  canPaste,
  disabled,
  inputRef,
  onValue,
  onBlur,
  onEnter,
  onPasteButton,
  onSkip,
}: {
  id: string;
  /** The input's accessible name. */
  label: string;
  value: string;
  check: RepoCheck;
  touched: boolean;
  note: string | null;
  canPaste: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onValue: (value: string, source: UrlSource) => void;
  onBlur: () => void;
  onEnter: () => void;
  onPasteButton: () => void;
  onSkip?: () => void;
}) {
  const valid = check.state === "valid";
  const invalid = check.state === "invalid";
  const showError = invalid && touched;
  const statusId = `${id}-status`;
  const github = valid ? check.repo.github : !value || /github\.com|^[\w-]+\/[\w.-]+$/i.test(value);

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const whole = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    if (input.value && !whole) return;
    const text = e.clipboardData.getData("text").trim();
    if (!text) return;
    e.preventDefault();
    onValue(text, "paste");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (check.state === "invalid" && check.fix) onValue(check.fix, "fix");
    else if (valid) onEnter();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={clsx(
          "group/field bg-raised relative overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-200",
          "shadow-[0_1px_0_rgb(0_0_0/0.03),0_16px_44px_-30px_rgb(0_0_0/0.55)]",
          "focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--ink)_7%,transparent),0_16px_44px_-30px_rgb(0_0_0/0.55)]",
          showError
            ? "border-crit/60"
            : valid
              ? "border-ink"
              : "border-rule-strong/70 hover:border-rule-strong focus-within:border-ink",
          disabled && "opacity-70",
        )}
      >
        <div className="flex h-16 items-center gap-3 pr-2 pl-4 sm:h-[72px] sm:gap-4 sm:pl-5">
          <span className="relative grid size-9 shrink-0 place-items-center" aria-hidden>
            {valid ? (
              <span
                key={check.repo.url}
                className="border-ink absolute inset-0 animate-[kx-pulse-ring_1.1s_cubic-bezier(0.2,0.7,0.2,1)_1] rounded-full border opacity-0"
              />
            ) : null}
            {github ? (
              <GitHubMark
                className={clsx(
                  "size-[26px] transition-[color,transform] duration-300",
                  valid ? "text-ink scale-105" : "text-muted group-focus-within/field:text-ink",
                )}
              />
            ) : (
              <GitBranch
                className={clsx(
                  "size-6 transition-colors duration-300",
                  valid ? "text-ink" : "text-muted group-focus-within/field:text-ink",
                )}
              />
            )}
          </span>
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            disabled={disabled}
            aria-label={label}
            aria-describedby={statusId}
            aria-invalid={showError || undefined}
            value={value}
            onChange={(e) => onValue(e.target.value, "type")}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            placeholder="https://github.com/owner/repository"
            className="text-ink placeholder:text-muted/70 h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium tracking-[-0.01em] outline-none sm:text-[18px]"
          />
          {valid ? (
            <span
              key={`ok-${check.repo.url}`}
              aria-hidden
              className="bg-brand text-on-brand grid size-7 shrink-0 animate-[kx-pop_0.42s_cubic-bezier(0.34,1.56,0.64,1)_both] place-items-center rounded-full"
            >
              <Check className="size-4" strokeWidth={2.75} />
            </span>
          ) : null}
          {value && !disabled ? (
            <button
              type="button"
              onClick={() => onValue("", "clear")}
              aria-label="Clear the repository link"
              className="text-muted hover:text-ink hover:bg-ink/[0.06] grid size-9 shrink-0 place-items-center rounded-full transition-colors"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : canPaste && !disabled ? (
            <button
              type="button"
              onClick={onPasteButton}
              className="border-rule-strong text-ink hover:border-ink hover:bg-ink/[0.04] inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors"
            >
              <ClipboardPaste className="size-4" aria-hidden />
              Paste
            </button>
          ) : null}
        </div>
        {/* The trace: a hairline that draws across once the link is usable. */}
        <span
          aria-hidden
          className="bg-ink absolute bottom-0 left-0 h-[2px] w-full origin-left transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
          style={{ transform: `scaleX(${valid ? 1 : 0})` }}
        />
      </div>

      <span aria-live="polite" className="sr-only">
        {valid ? `Repository ${check.repo.display} recognized.` : showError ? check.message : ""}
      </span>
      <div id={statusId} className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
        {valid ? (
          <>
            <span
              key={check.repo.url}
              className="border-ink bg-raised text-ink inline-flex h-8 animate-[kx-pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_both] items-center gap-2 rounded-full border pr-3.5 pl-2.5"
            >
              {check.repo.github ? (
                <GitHubMark className="size-4" />
              ) : (
                <GitBranch className="size-4" aria-hidden />
              )}
              <span className="font-mono text-[12.5px] font-medium">
                {check.repo.owner ? (
                  <span className="text-muted">{check.repo.display.slice(0, -check.repo.name.length)}</span>
                ) : null}
                {check.repo.name}
              </span>
            </span>
            <span className="text-muted text-[13px]">
              {check.repo.host} · default branch · one commit, fetched read-only
            </span>
            {note ? (
              <span className="text-muted kx-fade-up inline-flex items-center gap-1.5 text-[13px]">
                <Sparkles className="size-3.5" aria-hidden />
                {note}
              </span>
            ) : null}
          </>
        ) : invalid ? (
          <>
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 text-[13px] transition-colors",
                showError ? "text-crit" : "text-muted",
              )}
            >
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              {check.message}
            </span>
            {check.fix ? (
              <button
                type="button"
                onClick={() => onValue(check.fix!, "fix")}
                className="border-rule-strong text-ink hover:border-ink hover:bg-ink/[0.04] kx-fade-up inline-flex h-8 max-w-full items-center gap-2 rounded-full border px-3 text-[12.5px] font-medium transition-colors"
              >
                <Sparkles className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  Use <span className="font-mono">{check.fix.replace(/^https:\/\//, "")}</span>
                </span>
                <kbd className="border-rule bg-paper text-muted hidden rounded-sm border px-1.5 py-px font-mono text-[10.5px] sm:inline">
                  Enter
                </kbd>
              </button>
            ) : null}
          </>
        ) : (
          <>
            <span className="text-muted text-[13px]">Try a deliberately vulnerable app:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={disabled}
                onClick={() => onValue(`https://github.com/${ex}`, "example")}
                className="border-rule bg-raised text-ink hover:border-ink inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-[12px] transition-[border-color,transform] duration-150 hover:-translate-y-px active:translate-y-0"
              >
                <GitHubMark className="text-muted size-3.5" />
                {ex}
              </button>
            ))}
          </>
        )}
        {!valid && onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            disabled={disabled}
            className="text-muted hover:text-ink group/skip ml-auto inline-flex items-center gap-1.5 text-[13px] transition-colors"
          >
            <Archive className="size-4" aria-hidden />
            No repository? Upload an archive later
            <ArrowRight
              className="size-3.5 transition-transform duration-200 group-hover/skip:translate-x-0.5"
              aria-hidden
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
