import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui";
import { apiPublic } from "@/lib/server";
import type { Me, Role } from "@/lib/types";

import { AcceptInvitation } from "./accept";

export const metadata: Metadata = { title: "Invitation" };

interface Preview {
  organization: string;
  role: Role;
  invited_by: string;
  email: string;
  expires_at: string;
}

const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: "full control, including members and billing",
  admin: "manage members and projects",
  researcher: "create projects, run scans and confirm findings",
  reviewer: "review findings and close false positives",
  viewer: "read-only access",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, me] = await Promise.all([
    apiPublic<Preview>(`/invitations/${encodeURIComponent(token)}`),
    apiPublic<Me>("/auth/me"),
  ]);

  if (!preview) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">Invitation not valid</h1>
        <p className="text-muted">
          This link has expired, was replaced by a newer invitation, or has already been used. Ask the person
          who invited you to send a new one.
        </p>
      </div>
    );
  }

  const next = `/invite/${token}`;
  const matches = me?.user.email.toLowerCase() === preview.email;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">
          Join {preview.organization}
        </h1>
        <p className="text-muted">
          {preview.invited_by} invited <span className="text-ink">{preview.email}</span> as a {preview.role}:{" "}
          {ROLE_DESCRIPTION[preview.role]}.
        </p>
      </div>
      {!me ? (
        <div className="flex flex-col gap-2">
          <ButtonLink variant="primary" href={`/login?next=${encodeURIComponent(next)}`} className="w-full">
            Sign in to accept
          </ButtonLink>
          <ButtonLink href={`/register?next=${encodeURIComponent(next)}`} className="w-full">
            Create an account
          </ButtonLink>
          <p className="text-muted text-xs">
            Use {preview.email}. The invitation only works for that address.
          </p>
        </div>
      ) : matches ? (
        <AcceptInvitation token={token} />
      ) : (
        <p className="border-crit/40 bg-crit-soft text-crit rounded-sm border px-3 py-2 text-[13px]">
          You&apos;re signed in as {me.user.email}. Sign out and sign in as {preview.email} to accept.
        </p>
      )}
    </div>
  );
}
