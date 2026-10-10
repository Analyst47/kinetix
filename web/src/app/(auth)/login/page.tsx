import type { Metadata } from "next";

import { AuthHeading, AuthSwitch } from "@/components/auth/heading";

import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

// Reads KINETIX_DEMO at request time so one build serves both demo and real deployments.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-col gap-7">
      <AuthHeading eyebrow="Sign in" title="Welcome back." tail="Pick up the trace." />
      <LoginForm demo={process.env.KINETIX_DEMO === "1" && !next?.startsWith("/invite/")} next={next} />
      <AuthSwitch
        prompt="New to KinetixZero?"
        href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
        label="Create an account"
      />
    </div>
  );
}
