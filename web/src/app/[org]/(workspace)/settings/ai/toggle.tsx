"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

export function AiToggle({ org, enabled, notice }: { org: string; enabled: boolean; notice: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAck = !enabled && !!notice;
  return (
    <div className="flex flex-col gap-2">
      {needsAck ? (
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="accent-vg mt-0.5"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>I&apos;ve read the notice above and accept it for this workspace.</span>
        </label>
      ) : null}
      <div>
        <Button
          variant={enabled ? "danger" : "primary"}
          disabled={pending || (needsAck && !acknowledged)}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await call("PATCH", `/orgs/${org}/ai`, {
                enabled: !enabled,
                acknowledge_data_notice: needsAck && acknowledged,
              });
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
