"use client";

import clsx from "clsx";
import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

const LINKS = [
  { href: "/product", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/#pricing", label: "Pricing" },
];

export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={clsx(
        "sticky top-0 z-50 border-b transition-colors duration-200",
        scrolled || open ? "border-rule bg-black/80 backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 sm:px-8">
        <Link href="/" aria-label="KinetixZero home" className="shrink-0">
          <Wordmark size={16} />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={clsx(
                "rounded-full px-3 py-1.5 text-[14px] font-medium transition-colors",
                pathname === l.href ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {signedIn ? (
            <ButtonLink href="/app" variant="primary" className="h-10 px-5 text-[14px]">
              Open app <ArrowUpRight />
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="secondary" className="h-10 px-5 text-[14px]">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" variant="primary" className="h-10 px-5 text-[14px]">
                Get started <ArrowUpRight />
              </ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="text-ink hover:bg-ink/[0.06] ml-auto grid size-10 place-items-center rounded-full md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {open ? (
        <div className="border-rule border-t px-4 pt-2 pb-5 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-ink border-rule block border-b py-3.5 text-[16px] font-medium"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            {signedIn ? (
              <ButtonLink href="/app" variant="primary" className="h-11" onClick={() => setOpen(false)}>
                Open app
              </ButtonLink>
            ) : (
              <>
                <ButtonLink
                  href="/register"
                  variant="primary"
                  className="h-11"
                  onClick={() => setOpen(false)}
                >
                  Get started
                </ButtonLink>
                <ButtonLink href="/login" variant="secondary" className="h-11" onClick={() => setOpen(false)}>
                  Sign in
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
