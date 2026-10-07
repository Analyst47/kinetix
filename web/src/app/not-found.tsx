import { ButtonLink } from "@/components/ui";
import { Wordmark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col gap-10 px-6 py-6 sm:px-12">
      <Wordmark />
      <div className="flex max-w-[52ch] flex-col items-start gap-3">
        <span className="text-muted font-mono text-[28px] leading-8 font-medium tracking-[-0.02em]">404</span>
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">Nothing here</h1>
        <p className="text-muted">
          The page doesn&apos;t exist, or it belongs to a workspace you&apos;re not a member of.
        </p>
        <ButtonLink href="/" variant="secondary" className="mt-2">
          Go to your workspace
        </ButtonLink>
      </div>
    </main>
  );
}
