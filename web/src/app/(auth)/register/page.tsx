import type { Metadata } from "next";

import { LiveDot } from "@/components/auth/heading";

import { RegisterForm } from "./form";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const joining = next?.startsWith("/invite/");
  return (
    <div className="flex flex-col gap-4">
      {/* Where this step sits: the account first, then a project (or the invitation). */}
      <ol aria-label="Getting started" className="eyebrow flex items-center gap-3 text-[10.5px]">
        <li aria-current="step" className="text-ink inline-flex items-center gap-2.5">
          <LiveDot />
          01 Account
        </li>
        <li aria-hidden className="bg-rule-strong h-px w-8" />
        <li className="text-muted">{joining ? "02 Join the workspace" : "02 First project"}</li>
      </ol>
      <RegisterForm next={next} />
    </div>
  );
}
