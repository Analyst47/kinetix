"use client";

import { Play, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";

export function AutoRefresh({ every = 2000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}

export function StartScanButton({
  org,
  project,
  targetId,
  disabled,
}: {
  org: string;
  project: string;
  targetId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={disabled || pending}
        title={disabled ? "Only uploaded snapshots can be scanned here." : undefined}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await call("POST", `/orgs/${org}/projects/${project}/scans`, { target_id: targetId });
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't start the scan.");
          } finally {
            setPending(false);
          }
        }}
      >
        <Play aria-hidden />
        {pending ? "Starting…" : "Start scan"}
      </Button>
      {error ? <span className="text-crit max-w-[40ch] text-right text-xs">{error}</span> : null}
    </div>
  );
}

export function UploadSource({ org, project }: { org: string; project: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    for (const k of ["version", "commit"]) if (!form.get(k)) form.delete(k);
    try {
      await call("POST", `/orgs/${org}/projects/${project}/targets/archive`, form);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Upload aria-hidden />
        Upload source
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Upload source snapshot"
        description="A .zip or .tar.gz of code you are authorized to analyze. It's validated before it is unpacked."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="upload-source" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </>
        }
      >
        <form id="upload-source" action={submit} className="flex flex-col gap-4">
          <Field label="Archive" htmlFor="file">
            <input
              id="file"
              name="file"
              type="file"
              required
              accept=".zip,.tar,.tar.gz,.tgz"
              className="text-sm"
            />
          </Field>
          <Field label="Name" htmlFor="name">
            <input id="name" name="name" required placeholder="juice-shop" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Version" htmlFor="version">
              <input id="version" name="version" placeholder="17.1.1" className={`${inputClass} mono`} />
            </Field>
            <Field label="Commit" htmlFor="commit" hint="7 to 40 hex characters.">
              <input id="commit" name="commit" placeholder="3f2c9e1" className={`${inputClass} mono`} />
            </Field>
          </div>
          {error ? (
            <p role="alert" className="text-crit text-[13px]">
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>
    </>
  );
}
