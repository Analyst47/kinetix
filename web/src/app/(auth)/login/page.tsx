import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

// Reads KINETIX_DEMO at request time so one build serves both demo and real deployments.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">Sign in</h1>
        <p className="text-muted">Pick up your research where you left it.</p>
      </div>
      <LoginForm demo={process.env.KINETIX_DEMO === "1"} />
      <p className="text-muted">
        New to Kinetix?{" "}
        <Link href="/register" className="text-vg hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
