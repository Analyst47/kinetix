"use client";

import { Bug, Database, FileArchive, History, ScanLine, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Dialog } from "@/components/dialog";
import { useShell } from "@/components/shell-context";
import { Button, FormAlert, Panel, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import { TRIAGE_NAME } from "@/lib/format";
import type { Role } from "@/lib/types";

/** Only owners and admins may delete a project (the API enforces the same rule). */
export function canDeleteProjects(role: Role): boolean {
  return role === "owner" || role === "admin";
}

interface Target {
  slug: string;
  name: string;
  /** Open findings, when the caller knows them; shown in the summary. */
  openFindings?: number;
}

const REMOVED: { icon: typeof Bug; label: ReactNode }[] = [
  { icon: FileArchive, label: "Targets and their fetched source snapshots" },
  { icon: ScanLine, label: "Every scan and its results" },
  { icon: Bug, label: "All findings, with their evidence records and disclosure timelines" },
  { icon: Sparkles, label: `${TRIAGE_NAME} runs on those findings` },
  { icon: Database, label: "The dependency inventory" },
];

/**
 * Confirm-and-delete dialog for one project. The researcher types the project's URL name; the
 * API checks it again (`?confirm=`) so a stale or scripted click can't delete the wrong thing.
 */
export function DeleteProjectDialog({
  org,
  project,
  open,
  onClose,
  redirectTo,
  onDeleted,
}: {
  org: string;
  project: Target | null;
  open: boolean;
  onClose: () => void;
  /** Where to go afterwards (e.g. the workspace from a project page). Omit to refresh in place. */
  redirectTo?: string;
  onDeleted?: (slug: string) => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = project !== null && typed.trim() === project.slug;
  const formId = project ? `delete-project-${project.slug}` : "delete-project";

  function close() {
    // A delete in flight finishes (and closes the dialog) on its own.
    if (busy) return;
    setTyped("");
    setError(null);
    onClose();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!project || !matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await call(
        "DELETE",
        `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(project.slug)}?confirm=${encodeURIComponent(typed.trim())}`,
      );
      onDeleted?.(project.slug);
      setTyped("");
      setBusy(false);
      onClose();
      // Leaving the deleted project's pages: a fresh navigation (the target is dynamic, so it
      // re-fetches). Staying put: refresh this route's server data.
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 403) {
        setError(
          err.code === "demo_account" ? err.message : "Only workspace owners and admins can delete projects.",
        );
      } else if (err instanceof ApiError && err.status === 404) {
        setError("This project no longer exists. It may already have been deleted.");
        router.refresh();
      } else {
        setError(err instanceof Error ? err.message : "Couldn't delete the project. Try again.");
      }
    }
  }

  return (
    <Dialog
      open={open && project !== null}
      onClose={close}
      title={project ? `Delete ${project.name}?` : "Delete project"}
      description="This permanently removes the project for everyone in the workspace. It can't be undone."
      width={540}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            disabled={!matches || busy}
            className="disabled:hover:border-rule-strong disabled:hover:text-muted disabled:text-muted"
          >
            <Trash2 aria-hidden />
            {busy ? "Deleting…" : "Delete project"}
          </Button>
        </>
      }
    >
      {project ? (
        <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <p className="text-[13.5px]">
              Deleting <span className="font-semibold">{project.name}</span> removes:
            </p>
            <ul className="border-rule bg-sunken flex flex-col gap-2 rounded-xl border px-3.5 py-3">
              {REMOVED.map(({ icon: Icon, label }, i) => (
                <li key={i} className="text-ink flex items-start gap-2.5 text-[13px] leading-5">
                  <Icon className="text-muted mt-0.5 size-4 shrink-0" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
            {project.openFindings ? (
              <p className="text-muted text-[13px]">
                Including {project.openFindings.toLocaleString("en-US")} open finding
                {project.openFindings === 1 ? "" : "s"}.
              </p>
            ) : null}
            <p className="text-muted flex items-start gap-2 text-[13px] leading-5">
              <History className="mt-0.5 size-4 shrink-0" aria-hidden />
              The audit log keeps a permanent, hash-chained record that the project was deleted, by whom and
              when.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-confirm`} className="text-[13px] font-medium">
              Type{" "}
              <span className="bg-sunken border-rule rounded border px-1.5 py-px font-mono">
                {project.slug}
              </span>{" "}
              to confirm
            </label>
            <input
              id={`${formId}-confirm`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={typed.length > 0 && !matches}
              className={`${inputClass} font-mono`}
            />
          </div>

          {error ? <FormAlert>{error}</FormAlert> : null}
        </form>
      ) : null}
    </Dialog>
  );
}

/** A "Delete project" button with its confirmation dialog. Renders nothing for other roles. */
export function DeleteProjectButton({
  org,
  project,
  redirectTo,
  className,
}: {
  org: string;
  project: Target;
  redirectTo?: string;
  className?: string;
}) {
  const { org: membership } = useShell();
  const [open, setOpen] = useState(false);
  if (!canDeleteProjects(membership.role)) return null;
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} className={className}>
        <Trash2 aria-hidden />
        Delete project
      </Button>
      <DeleteProjectDialog
        org={org}
        project={project}
        open={open}
        onClose={() => setOpen(false)}
        redirectTo={redirectTo}
      />
    </>
  );
}

/** The "Danger zone" panel at the foot of a project's Scope page. Owners and admins only. */
export function ProjectDangerZone({ org, project }: { org: string; project: Target }) {
  const { org: membership } = useShell();
  if (!canDeleteProjects(membership.role)) return null;
  return (
    <Panel title="Danger zone">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-[14px] font-semibold">Delete this project</h3>
          <p className="text-muted text-[13px] leading-5">
            Permanently removes its targets, scans, findings, evidence, {TRIAGE_NAME} runs and disclosures.
            The audit log keeps a record of the deletion.
          </p>
        </div>
        <DeleteProjectButton org={org} project={project} redirectTo={`/${org}`} className="shrink-0" />
      </div>
    </Panel>
  );
}
