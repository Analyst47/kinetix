"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

export function AiToggle({ org, enabled }: { org: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant={enabled ? "danger" : "primary"}
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await call("PATCH", `/orgs/${org}/ai`, { enabled: !enabled });
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Couldn't change the setting.");
            } finally {
              setPending(false);
            }
          }}
        >
          {enabled ? "Turn off AI assistance" : "Turn on AI assistance"}
        </Button>
      </div>
      {error ? <p className="text-crit text-[13px]">{error}</p> : null}
    </div>
  );
}
