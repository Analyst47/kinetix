import type { Metadata } from "next";
import Link from "next/link";

import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">Reset your password</h1>
        <p className="text-muted">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <ForgotForm />
      <p className="text-muted">
        Remembered it?{" "}
        <Link href="/login" className="text-vg hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
