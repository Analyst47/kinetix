import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/heading";

import { ResetForm } from "./form";

export const metadata: Metadata = {
  title: "Choose a new password",
  // The reset token lives in the URL fragment; never leak this page's URL to other sites.
  referrer: "no-referrer",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-7">
      <AuthHeading
        eyebrow="Account recovery"
        title="Choose a new password."
        lede="Every device signed in to your account will be signed out."
      />
      <ResetForm />
    </div>
  );
}
