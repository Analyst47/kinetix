import type { Metadata } from "next";

import { AuthHeading, AuthSwitch } from "@/components/auth/heading";

import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-7">
      <AuthHeading
        eyebrow="Account recovery"
        title="Reset your password."
        lede="We'll email you a one-time link to choose a new one."
      />
      <ForgotForm />
      <AuthSwitch prompt="Remembered it?" href="/login" label="Sign in" />
    </div>
  );
}
