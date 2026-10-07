import type { Metadata } from "next";

import { PageBar } from "@/components/shell-context";
import { PageHeader, Panel } from "@/components/ui";
import { fullDate, relative } from "@/lib/format";
import { api } from "@/lib/server";

import { MfaControls, RevokeSession } from "./client";

export const metadata: Metadata = { title: "Security" };

interface MfaStatus {
  enabled: boolean;
  enabled_at: string | null;
  recovery_codes_remaining: number;
}

interface SessionRow {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  current: boolean;
}

function device(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function SecurityPage() {
  const [status, sessions] = await Promise.all([
    api<MfaStatus>("/auth/mfa"),
    api<SessionRow[]>("/auth/sessions"),
  ]);
  return (
    <>
      <PageBar crumbs={[{ label: "Your account" }, { label: "Security" }]} />
      <main className="flex w-full max-w-[860px] flex-col gap-5 p-4 md:p-6">
        <PageHeader title="Security" description="Protect the account that holds your unreleased findings." />
        <Panel
          title="Two-step verification"
          aside={
            <span className={`text-[13px] font-semibold ${status.enabled ? "text-ok" : "text-muted"}`}>
              {status.enabled ? "On" : "Off"}
            </span>
          }
        >
          <div className="flex flex-col gap-3 p-4">
            <p className="text-muted max-w-[64ch]">
              {status.enabled
                ? `Turned on ${fullDate(status.enabled_at!)}. Signing in asks for a code from your authenticator app. ${status.recovery_codes_remaining} of 10 recovery codes left.`
                : "Require a code from an authenticator app (1Password, Google Authenticator, Authy) every time you sign in. Strongly recommended for anyone handling unreleased vulnerabilities."}
            </p>
            <MfaControls enabled={status.enabled} />
          </div>
        </Panel>
        <Panel title="Where you're signed in">
          <ul>
            {sessions.map((s) => (
              <li
                key={s.id}
                className="border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-[220px] flex-1 flex-col">
                  <span className="font-medium">
                    {device(s.user_agent)}
                    {s.current ? <span className="text-ok font-normal"> (this device)</span> : null}
                  </span>
                  <span className="text-muted text-xs">
                    {s.ip_address ?? "Unknown address"}. Signed in {fullDate(s.created_at)}. Active{" "}
                    {relative(s.last_seen_at).toLowerCase()}.
                  </span>
                </div>
                {s.current ? null : <RevokeSession id={s.id} />}
              </li>
            ))}
          </ul>
        </Panel>
      </main>
    </>
  );
}
