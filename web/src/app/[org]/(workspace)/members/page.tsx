import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { Avatar, PageHeader, Panel } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { api } from "@/lib/server";
import type { Me, Role, User } from "@/lib/types";

import { InviteButton, RevokeInvite, RoleSelect, RemoveMember } from "./client";

export const metadata: Metadata = { title: "Members" };

interface Member {
  user: User;
  role: Role;
  joined_at: string;
  mfa_enabled: boolean;
  you: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  invited_by: string;
  created_at: string;
  expires_at: string;
}

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const me = await api<Me>("/auth/me");
  const myRole = me.organizations.find((o) => o.slug === org)?.role ?? "viewer";
  const canManage = myRole === "owner" || myRole === "admin";
  const [members, invitations] = await Promise.all([
    api<Member[]>(`/orgs/${org}/members`),
    canManage ? api<Invitation[]>(`/orgs/${org}/invitations`) : Promise.resolve([] as Invitation[]),
  ]);

  return (
    <>
      <PageBar crumbs={[{ label: "Members" }]} />
      <main className="flex w-full max-w-[1100px] flex-col gap-5 p-4 md:p-6">
        <PageHeader
          title="Members"
          description="People in this workspace and what they can do."
          actions={canManage ? <InviteButton org={org} canInviteOwners={myRole === "owner"} /> : null}
        />
        <Panel title="People" aside={<span className="text-muted text-xs">{members.length} total</span>}>
          <ul>
            {members.map((m) => (
              <li
                key={m.user.id}
                className="border-rule flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0"
              >
                <Avatar name={m.user.name} />
                <div className="flex min-w-[200px] flex-1 flex-col">
                  <span className="font-medium">
                    {m.user.name}
                    {m.you ? <span className="text-muted font-normal"> (you)</span> : null}
                  </span>
                  <span className="text-muted text-xs">{m.user.email}</span>
                </div>
                <span className={`text-xs ${m.mfa_enabled ? "text-ok" : "text-muted"}`}>
                  {m.mfa_enabled ? "Two-step on" : "Two-step off"}
                </span>
                <span className="text-muted w-24 text-xs">Joined {shortDate(m.joined_at)}</span>
                {canManage && !(m.role === "owner" && myRole !== "owner") ? (
                  <RoleSelect org={org} userId={m.user.id} role={m.role} canGrantOwner={myRole === "owner"} />
                ) : (
                  <span className="w-[140px] text-[13px] capitalize">{m.role}</span>
                )}
                {(canManage && !(m.role === "owner" && myRole !== "owner")) || m.you ? (
                  <RemoveMember org={org} userId={m.user.id} name={m.user.name} self={m.you} />
                ) : (
                  <span className="w-8" />
                )}
              </li>
            ))}
          </ul>
        </Panel>
        {canManage ? (
          <Panel title="Pending invitations">
            {invitations.length === 0 ? (
              <p className="text-muted px-4 py-3.5">No pending invitations.</p>
            ) : (
              <ul>
                {invitations.map((i) => (
                  <li
                    key={i.id}
                    className="border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0"
                  >
                    <div className="flex min-w-[200px] flex-1 flex-col">
                      <span className="font-medium">{i.email}</span>
                      <span className="text-muted text-xs">
                        Invited by {i.invited_by}. Expires {shortDate(i.expires_at)}.
                      </span>
                    </div>
                    <span className="w-[140px] text-[13px] capitalize">{i.role}</span>
                    <RevokeInvite org={org} id={i.id} email={i.email} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}
      </main>
    </>
  );
}
