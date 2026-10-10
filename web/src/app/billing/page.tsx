import { redirect } from "next/navigation";

import { apiPublic } from "@/lib/server";
import type { Me } from "@/lib/types";

/**
 * Public "Upgrade" links land here. A signed-in user goes to Plan & usage in their workspace;
 * a signed-out visitor signs in first and comes straight back.
 */
export default async function BillingEntry({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const query = plan && /^[a-z]{2,16}$/.test(plan) ? `?plan=${plan}` : "";
  const me = await apiPublic<Me>("/auth/me");
  if (!me) redirect(`/login?next=${encodeURIComponent(`/billing${query}`)}`);
  const org = me.organizations[0];
  if (!org) redirect("/login");
  redirect(`/${org.slug}/billing${query}`);
}
