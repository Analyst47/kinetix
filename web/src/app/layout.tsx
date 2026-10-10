import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";

const SITE_URL = process.env.KINETIX_SITE_URL ?? "https://kinetixzero.com";
const TAGLINE = "Find the paths attackers would take. Fix them before they do.";
const DESCRIPTION =
  "KinetixZero is an AI-assisted application security platform. It analyzes source code and " +
  "dependencies, correlates findings with public vulnerability intelligence, and helps " +
  "researchers validate and responsibly disclose real vulnerabilities.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `KinetixZero — ${TAGLINE}`, template: "%s · KinetixZero" },
  description: DESCRIPTION,
  applicationName: "KinetixZero",
  keywords: [
    "application security",
    "vulnerability research",
    "SAST",
    "dependency scanning",
    "responsible disclosure",
    "AI security",
    "penetration testing",
  ],
  authors: [{ name: "KinetixZero" }],
  openGraph: {
    type: "website",
    siteName: "KinetixZero",
    title: `KinetixZero — ${TAGLINE}`,
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `KinetixZero — ${TAGLINE}`,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#14181d" },
  ],
};

// Applies a saved theme before first paint so there is no flash of the wrong theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("kx-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the request makes every page render per request, which the CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-paper text-ink min-h-dvh">{children}</body>
    </html>
  );
}
