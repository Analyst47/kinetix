import type { ReactNode } from "react";

import { Wordmark } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <Wordmark />
        <main className="flex flex-1 items-center">
          <div className="w-full max-w-[360px]">{children}</div>
        </main>
        <p className="text-muted text-xs">
          Kinetix assists research on targets you are authorized to analyze.
        </p>
      </div>
      <BrandPanel />
    </div>
  );
}

function BrandPanel() {
  // The design system's cover, at page scale: a verdigris slab with a chain of custody
  // cut out of it, turning onto an ink block.
  const tiles = Array.from({ length: 9 }, (_, i) => i);
  return (
    <div aria-hidden className="border-rule bg-sunken relative hidden overflow-hidden border-l lg:block">
      <div className="bg-vg absolute top-[-16px] left-[18%] h-[78%] w-[34%] rounded-md">
        <div className="absolute top-12 left-1/2 flex -translate-x-1/2 flex-col gap-3">
          {tiles.map((i) => (
            <span key={i} className="bg-sunken size-4 rounded-sm" />
          ))}
        </div>
      </div>
      <div className="bg-ink absolute top-[30%] right-[-24px] h-[48%] w-[34%] rounded-md">
        <div className="absolute bottom-[18%] left-8 flex gap-3">
          {tiles.slice(0, 4).map((i) => (
            <span key={i} className="bg-vg size-4 rounded-sm" />
          ))}
        </div>
      </div>
      <div className="bg-rule absolute bottom-[10%] left-[6%] h-[34%] w-[10%] rounded-md" />
      <div className="bg-crit absolute bottom-[calc(10%+34%+16px)] left-[6%] h-4 w-[6%] rounded-sm" />
      <p className="text-muted absolute right-10 bottom-10 left-[18%] max-w-[34ch] text-[15px] leading-[22px]">
        Evidence first. Findings earn their status.
      </p>
    </div>
  );
}
