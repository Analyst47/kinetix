import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/heading";
import { InvitePass } from "@/components/auth/invite-pass";
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, me] = await Promise.all([
    apiPublic<Preview>(`/invitations/${encodeURIComponent(token)}`),
    apiPublic<Me>("/auth/me"),
  ]);

  if (!preview) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading
          eyebrow="Invitation"
          title="This invitation isn't valid."
          lede="The link has expired, was replaced by a newer invitation, or has already been used. Ask the person who invited you to send a new one."
        />
        <ButtonLink href="/login" className="h-11 w-full">
          Go to sign in
        </ButtonLink>
      </div>
    );
  }

  const next = `/invite/${token}`;
  const matches = me?.user.email.toLowerCase() === preview.email;

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading eyebrow="Invitation" title={`Join ${preview.organization.replace(/\.$/, "")}.`} />
      <InvitePass
        inviter={preview.invited_by}
        organization={preview.organization}
        role={preview.role}
        roleDescription={ROLE_DESCRIPTION[preview.role]}
        email={preview.email}
        expires={formatDate(preview.expires_at)}
      />
      {!me ? (
        <div className="flex flex-col gap-2.5">
          <ButtonLink
            variant="primary"
            href={`/login?next=${encodeURIComponent(next)}`}
            className="h-11 w-full text-[14.5px] font-semibold"
          >
            Sign in to accept
          </ButtonLink>
          <ButtonLink
            href={`/register?next=${encodeURIComponent(next)}`}
            className="h-11 w-full text-[14.5px]"
          >
            Create an account
          </ButtonLink>
          <p className="text-muted mt-1 text-xs">
            Use {preview.email}. The invitation only works for that address.
          </p>
        </div>
      ) : matches ? (
        <AcceptInvitation token={token} />
      ) : (
        <p className="border-crit/40 bg-crit-soft text-crit rounded-md border px-3 py-2 text-[13px]">
          You&apos;re signed in as {me.user.email}. Sign out and sign in as {preview.email} to accept.
        </p>
      )}
    </div>
  );
}
