import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ShellProvider } from "@/components/shell-context";
import { UpgradeProvider } from "@/components/usage";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { api } from "@/lib/server";
import type { Billing, Me } from "@/lib/types";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const [me, billing] = await Promise.all([api<Me>("/auth/me"), api<Billing>("/billing")]);
  const membership = me.organizations.find((o) => o.slug === org);
  if (!membership) notFound();
  return (
    <ShellProvider
      value={{
        user: { name: me.user.name, email: me.user.email },
        org: membership,
        usage: billing.usage,
      }}
    >
      <UpgradeProvider org={org}>
        <div className="flex min-h-dvh flex-col md:flex-row">
          <WorkspaceSidebar
            org={org}
            orgName={membership.name}
            usage={billing.usage}
            role={membership.role}
            organizations={me.organizations}
          />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </UpgradeProvider>
    </ShellProvider>
  );
}
