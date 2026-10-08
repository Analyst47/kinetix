import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

// Reads KINETIX_DEMO at request time so one build serves both demo and real deployments.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="display text-ink text-[28px]">Sign in</h1>
        <p className="text-muted">Pick up your research where you left it.</p>
      </div>
      <LoginForm demo={process.env.KINETIX_DEMO === "1" && !next?.startsWith("/invite/")} next={next} />
      <p className="text-muted">
        New to Kinetix?{" "}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="text-vg hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
