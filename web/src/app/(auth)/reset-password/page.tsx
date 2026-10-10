import type { Metadata } from "next";

import { ResetForm } from "./form";

export const metadata: Metadata = {
  title: "Choose a new password",
  // The reset token lives in the URL fragment; never leak this page's URL to other sites.
  referrer: "no-referrer",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="display text-ink text-[clamp(32px,4vw,40px)]">Choose a new password</h1>
        <p className="text-muted">Every device signed in to your account will be signed out.</p>
      </div>
      <ResetForm />
    </div>
  );
}
