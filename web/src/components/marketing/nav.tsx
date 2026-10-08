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
  { href: "/#pricing", label: "Early access" },
];

export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="border-rule/70 bg-paper/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="Kinetix home" className="shrink-0">
          <Wordmark size={17} />
        </Link>

        <div className="text-muted ml-2 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-ink rounded-md px-3 py-2 text-[14px] font-medium transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {signedIn ? (
            <ButtonLink href="/app" variant="primary">
              Open app
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" variant="primary">
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
          className="text-ink hover:bg-rule ml-auto grid size-9 place-items-center rounded-md md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {open ? (
        <div className="border-rule/70 bg-paper border-t md:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-4 sm:px-8">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-ink hover:bg-rule rounded-md px-3 py-2.5 text-[15px] font-medium"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2">
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
        </div>
      ) : null}
    </header>
  );
}
