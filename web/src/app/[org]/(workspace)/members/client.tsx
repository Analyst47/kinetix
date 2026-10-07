"use client";

import { Check, ChevronDown, Copy, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import type { Role } from "@/lib/types";

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "owner", label: "Owner", hint: "Everything, including owners" },
  { value: "admin", label: "Admin", hint: "Members and projects" },
  { value: "researcher", label: "Researcher", hint: "Scan, create and confirm findings" },
  { value: "reviewer", label: "Reviewer", hint: "Review and close findings" },
  { value: "viewer", label: "Viewer", hint: "Read only" },
];

export function RoleSelect({
  org,
  userId,
  role,
  canGrantOwner,
}: {
  org: string;
  userId: string;
  role: Role;
  canGrantOwner: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex w-[140px] flex-col">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role
      </label>
      <div className="relative">
        <select
          id={`role-${userId}`}
          value={role}
          onChange={async (e) => {
            setError(null);
            try {
              await call("PATCH", `/orgs/${org}/members/${userId}`, { role: e.target.value });
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Couldn't change the role.");
            }
          }}
          className={`${inputClass} h-8 cursor-pointer appearance-none pr-8`}
        >
          {ROLES.filter((r) => canGrantOwner || r.value !== "owner").map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <ChevronDown className="text-muted pointer-events-none absolute top-2 right-2.5 size-4" aria-hidden />
      </div>
      {error ? <span className="text-crit mt-1 text-xs">{error}</span> : null}
    </div>
  );
}

export function RemoveMember({
  org,
  userId,
  name,
  self,
}: {
  org: string;
  userId: string;
  name: string;
  self: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={self ? "Leave workspace" : `Remove ${name}`}
        className="text-muted hover:bg-rule hover:text-crit inline-flex size-8 items-center justify-center rounded-md"
      >
        <Trash2 className="size-4" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={self ? "Leave this workspace?" : `Remove ${name}?`}
        description={
          self
            ? "You'll lose access to its projects and findings. Someone will need to invite you again."
            : "They lose access immediately. Their past work and audit history stay."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                setError(null);
                try {
                  await call("DELETE", `/orgs/${org}/members/${userId}`);
                  setOpen(false);
                  if (self) router.push("/");
                  router.refresh();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Couldn't remove the member.");
                }
              }}
            >
              {self ? "Leave workspace" : "Remove member"}
            </Button>
          </>
        }
      >
        {error ? <p className="text-crit text-[13px]">{error}</p> : <span />}
      </Dialog>
    </>
  );
}

export function RevokeInvite({ org, id, email }: { org: string; id: string; email: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      className="text-muted"
      aria-label={`Revoke invitation for ${email}`}
      onClick={async () => {
        await call("DELETE", `/orgs/${org}/invitations/${id}`).catch(() => undefined);
        router.refresh();
      }}
    >
      Revoke
    </Button>
  );
}

export function InviteButton({ org, canInviteOwners }: { org: string; canInviteOwners: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("researcher");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close() {
    setOpen(false);
    setLink(null);
    setEmail("");
    setCopied(false);
    setError(null);
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden />
        Invite member
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={link ? "Invitation created" : "Invite member"}
        description={
          link
            ? "Send this link to them directly. It's shown only once, works only for their email, and expires in 7 days."
            : "They'll get access when they accept with this email address."
        }
        footer={
          link ? (
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="invite-form" disabled={pending || !email}>
                {pending ? "Creating…" : "Create invitation"}
              </Button>
            </>
          )
        }
      >
        {link ? (
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              aria-label="Invitation link"
              className={`${inputClass} mono text-xs`}
            />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : (
          <form
            id="invite-form"
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setError(null);
              try {
                const r = await call<{ link: string }>("POST", `/orgs/${org}/invitations`, { email, role });
                setLink(r.link);
                router.refresh();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Couldn't create the invitation.");
              } finally {
                setPending(false);
              }
            }}
          >
            <Field label="Email" htmlFor="invite-email">
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-[13px] font-medium">Role</legend>
              {ROLES.filter((r) => canInviteOwners || r.value !== "owner").map((r) => (
                <label key={r.value} className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="invite-role"
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                    className="size-4 accent-[var(--vg)]"
                  />
                  <span className="font-medium">{r.label}</span>
                  <span className="text-muted text-xs">{r.hint}</span>
                </label>
              ))}
            </fieldset>
            {error ? <p className="text-crit text-[13px]">{error}</p> : null}
          </form>
        )}
      </Dialog>
    </>
  );
}
