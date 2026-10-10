import type { ReactNode } from "react";

import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNav } from "@/components/marketing/nav";
import { apiPublic } from "@/lib/server";
import type { Me } from "@/lib/types";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // Public pages: never redirect. We only use the session to decide the nav CTA.
  const me = await apiPublic<Me>("/auth/me");
  return (
    <div className="night min-h-dvh">
      <MarketingNav signedIn={me !== null} />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
