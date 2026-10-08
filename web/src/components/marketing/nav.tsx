"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Wordmark } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

const LINKS = [
  { href: "/product", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/#plans", label: "Plans" },
];

export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-50 px-4 pt-4 sm:pt-5">
      <header className="mx-auto w-full max-w-5xl">
        <nav className="border-rule/80 bg-raised/70 flex h-14 items-center gap-2 rounded-full border px-2.5 pr-2.5 pl-4 shadow-lg shadow-black/20 backdrop-blur-xl">
          <Link href="/" aria-label="Kinetix home" className="shrink-0">
            <Wordmark size={16} />
          </Link>

          <div className="text-muted mx-auto hidden items-center gap-0.5 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="hover:text-ink hover:bg-rule/60 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto hidden items-center gap-1.5 md:flex">
            {signedIn ? (
              <ButtonLink href="/app" variant="primary" className="h-9 rounded-full px-4">
                Open app
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" className="h-9 rounded-full">
                  Sign in
                </ButtonLink>
                <ButtonLink href="/register" variant="primary" className="h-9 rounded-full px-4">
                  Request access
                </ButtonLink>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="text-ink hover:bg-rule ml-auto grid size-9 place-items-center rounded-full md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </nav>

        {open ? (
          <div className="border-rule/80 bg-raised/95 mt-2 rounded-2xl border p-2 shadow-xl shadow-black/30 backdrop-blur-xl md:hidden">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-ink hover:bg-rule block rounded-xl px-3 py-2.5 text-[15px] font-medium"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-1 flex flex-col gap-2 p-1">
              {signedIn ? (
                <ButtonLink href="/app" variant="primary" onClick={() => setOpen(false)}>
                  Open app
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/login" variant="secondary" onClick={() => setOpen(false)}>
                    Sign in
                  </ButtonLink>
                  <ButtonLink href="/register" variant="primary" onClick={() => setOpen(false)}>
                    Request access
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>
    </div>
  );
}
