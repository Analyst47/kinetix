"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="primary"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const m = await call<{ slug: string }>(
              "POST",
              `/invitations/${encodeURIComponent(token)}/accept`,
            );
            router.push(`/${m.slug}`);
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't accept the invitation.");
            setPending(false);
          }
        }}
      >
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
      {error ? (
        <p role="alert" className="text-crit text-[13px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
