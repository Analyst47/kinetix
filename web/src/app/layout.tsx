import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kinetix", template: "%s · Kinetix" },
  description: "Vulnerability research and responsible-disclosure platform.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#14181d" },
  ],
};

// Applies a saved theme before first paint so there is no flash of the wrong theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("kx-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-paper text-ink min-h-dvh">{children}</body>
    </html>
  );
}
