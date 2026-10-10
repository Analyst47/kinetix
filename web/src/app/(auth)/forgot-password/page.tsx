import type { Metadata } from "next";
import Link from "next/link";

import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="display text-ink text-[clamp(32px,4vw,40px)]">Reset your password</h1>
        <p className="text-muted">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <ForgotForm />
      <p className="text-muted">
        Remembered it?{" "}
        <Link
          href="/login"
          className="text-ink decoration-rule-strong hover:decoration-ink underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
