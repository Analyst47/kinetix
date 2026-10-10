"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Dialog } from "@/components/dialog";

import { KeyCap, KeyCombo, isTypingTarget, useModKey } from "./keys";

interface GoTarget {
  key: string;
  label: string;
  /** "project" targets only exist while a project is open. */
  scope: "workspace" | "project";
  href: (org: string, project: string) => string;
}

/** "g" then a key. One table drives the handler, the sidebar hints, the palette and the help dialog. */
export const GO_TARGETS: GoTarget[] = [
  { key: "p", label: "Projects", scope: "workspace", href: (o) => `/${o}` },
  { key: "f", label: "Findings", scope: "project", href: (o, p) => `/${o}/${p}/findings` },
  { key: "s", label: "Scans", scope: "project", href: (o, p) => `/${o}/${p}/scans` },
  { key: "d", label: "Dependencies", scope: "project", href: (o, p) => `/${o}/${p}/dependencies` },
  { key: "l", label: "Label queue", scope: "project", href: (o, p) => `/${o}/${p}/label` },
  { key: "m", label: "Members", scope: "workspace", href: (o) => `/${o}/members` },
  { key: "b", label: "Plan & usage", scope: "workspace", href: (o) => `/${o}/billing` },
  { key: "a", label: "AI assistance", scope: "workspace", href: (o) => `/${o}/settings/ai` },
];

export function goTargets(org: string, project?: string) {
  return GO_TARGETS.filter((t) => t.scope === "workspace" || project).map((t) => ({
    ...t,
    path: t.href(org, project ?? ""),
  }));
}

/** The keycaps for a target, e.g. ["G", "F"], for hints in the sidebar and palette. */
export function goKeys(key: string): string[] {
  return ["G", key.toUpperCase()];
}

const SEQUENCE_MS = 1500;

/**
 * Global keyboard shortcuts for the signed-in app: ⌘K / Ctrl+K toggles the palette, "?" opens
 * the shortcuts dialog, and "g" then a key navigates. Listens in the capture phase so a
 * completed sequence is consumed before page-level handlers (the label queue binds bare F and
 * S). Never fires while typing in a field or while a modal is open. Returns whether a "g" is
 * waiting for its second key, so the UI can show what comes next.
 */
export function useShellKeys({
  org,
  project,
  onPalette,
  onShortcuts,
}: {
  org: string;
  project?: string;
  onPalette: () => void;
  onShortcuts: () => void;
}): boolean {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let armedAt = 0;
    let timer: number | undefined;
    const disarm = () => {
      armedAt = 0;
      window.clearTimeout(timer);
      setPending(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (armedAt) disarm();
        onPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat) return;
      if (isTypingTarget(e.target) || document.querySelector("dialog[open]")) {
        if (armedAt) disarm();
        return;
      }

      const key = e.key.toLowerCase();
      if (armedAt) {
        const fresh = performance.now() - armedAt < SEQUENCE_MS;
        disarm();
        const target = fresh ? goTargets(org, project).find((t) => t.key === key) : undefined;
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          router.push(target.path);
          return;
        }
      }
      if (e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onShortcuts();
        return;
      }
      if (e.key === "g") {
        armedAt = performance.now();
        setPending(true);
        timer = window.setTimeout(disarm, SEQUENCE_MS);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(timer);
    };
  }, [org, project, router, onPalette, onShortcuts]);

  return pending;
}

/** A floating hint while "g" waits for its second key. */
export function GoHud({ org, project }: { org: string; project?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="night border-rule-strong/70 pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 animate-[kx-fade-up_0.18s_ease-out_both] items-center gap-3 rounded-full border px-3 py-2 text-[12px] shadow-[0_18px_50px_-14px_rgb(0_0_0/0.6)]"
    >
      <span className="flex items-center gap-1.5">
        <KeyCap>G</KeyCap>
        <span className="text-muted">then</span>
      </span>
      <span aria-hidden className="bg-rule h-4 w-px" />
      <span className="flex items-center gap-3 overflow-hidden">
        {goTargets(org, project).map((t, i) => (
          <span
            key={t.key}
            className={i > 3 ? "hidden items-center gap-1.5 sm:flex" : "flex items-center gap-1.5"}
          >
            <KeyCap>{t.key.toUpperCase()}</KeyCap>
            <span className="text-ink/80 whitespace-nowrap">{t.label}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function Row({ label, keys, note }: { label: string; keys: string[]; note?: string }) {
  return (
    <li className="flex h-9 items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-[13.5px]">{label}</span>
      {note ? <span className="text-muted text-[11.5px]">{note}</span> : null}
      <KeyCombo keys={keys} />
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="text-muted border-rule mb-1 border-b pb-2 font-mono text-[10px] font-medium tracking-[0.16em] uppercase">
        {title}
      </h3>
      <ul className="divide-rule flex flex-col divide-y">{children}</ul>
    </section>
  );
}

/** "?" — every shortcut in one place. */
export function ShortcutsDialog({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project?: string;
}) {
  const mod = useModKey();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={640}
      title="Keyboard shortcuts"
      description="Shortcuts pause while you are typing in a field."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Group title="Go to">
          {GO_TARGETS.map((t) => (
            <Row
              key={t.key}
              label={t.label}
              keys={goKeys(t.key)}
              note={t.scope === "project" && !project ? "in a project" : undefined}
            />
          ))}
        </Group>
        <div className="flex flex-col gap-6">
          <Group title="General">
            <Row label="Command palette" keys={[mod, "K"]} />
            <Row label="Keyboard shortcuts" keys={["?"]} />
            <Row label="Close a dialog or menu" keys={["Esc"]} />
          </Group>
          <Group title="Command palette">
            <Row label="Move" keys={["↑", "↓"]} />
            <Row label="Open" keys={["↵"]} />
            <Row label="Open a finding by number" keys={["#"]} note="e.g. 127" />
          </Group>
          {project ? (
            <Group title="Label queue">
              <Row label="Real vulnerability" keys={["R"]} />
              <Row label="False positive" keys={["F"]} />
              <Row label="Skip" keys={["S"]} />
              <Row label="Previous" keys={["←"]} />
            </Group>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
