import { initials } from "@/lib/format";

import { HIDDEN_STROKE } from "./mark";

/**
 * The invitation as a pass: who invited you, a traced link to the workspace, the role you'd
 * get, and the address and date it's valid for. Monochrome; the link draws in on load.
 */
export function InvitePass({
  inviter,
  organization,
  role,
  roleDescription,
  email,
  expires,
}: {
  inviter: string;
  organization: string;
  role: string;
  roleDescription: string;
  email: string;
  expires: string;
}) {
  return (
    <div className="border-rule bg-raised/70 relative overflow-hidden rounded-2xl border">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <span
          title={inviter}
          className="border-rule-strong bg-sunken text-ink grid size-11 shrink-0 place-items-center rounded-full border text-[13px] font-semibold"
        >
          {initials(inviter) || "?"}
        </span>
        <svg aria-hidden viewBox="0 0 100 12" preserveAspectRatio="none" className="h-3 min-w-0 flex-1">
          <path
            d="M2 6 H98"
            stroke="var(--ink)"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeLinecap="round"
            {...HIDDEN_STROKE}
            style={{
              strokeDashoffset: 1.1,
              animation: "kx-draw 0.9s cubic-bezier(0.4,0,0.2,1) 0.25s forwards",
            }}
          />
        </svg>
        <span className="relative grid size-11 shrink-0 place-items-center">
          <span className="kx-pulse-ring border-ink absolute inset-0 rounded-xl border opacity-0" />
          <span className="bg-brand text-on-brand relative grid size-11 place-items-center rounded-xl text-[13px] font-semibold">
            {initials(organization) || "?"}
          </span>
        </span>
      </div>
      <p className="text-muted px-5 pb-5 text-[13.5px] leading-[20px]">
        <span className="text-ink font-medium">{inviter}</span> invited you to{" "}
        <span className="text-ink font-medium">{organization}</span>.
      </p>

      {/* Perforation */}
      <div aria-hidden className="relative h-0">
        <span className="bg-paper border-rule absolute -top-2.5 -left-2.5 size-5 rounded-full border" />
        <span className="bg-paper border-rule absolute -top-2.5 -right-2.5 size-5 rounded-full border" />
        <span className="border-rule absolute inset-x-5 top-0 border-t border-dashed" />
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 px-5 pt-4 pb-5 text-[13px]">
        <dt className="eyebrow text-muted pt-px text-[10px]">Role</dt>
        <dd className="text-ink/90">
          <span className="text-ink font-medium capitalize">{role}</span>
          <span className="text-muted"> — {roleDescription}</span>
        </dd>
        <dt className="eyebrow text-muted pt-px text-[10px]">For</dt>
        <dd className="text-ink mono truncate">{email}</dd>
        <dt className="eyebrow text-muted pt-px text-[10px]">Valid until</dt>
        <dd className="text-ink/90">{expires}</dd>
      </dl>
    </div>
  );
}
