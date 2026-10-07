export function LogoMark({ size = 20 }: { size?: number }) {
  // Three custody tiles cut from a verdigris block: the chain the product is built around.
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="4" fill="var(--vg)" />
      <rect x="5" y="5" width="4" height="4" rx="1" fill="var(--paper)" />
      <rect x="11" y="5" width="4" height="4" rx="1" fill="var(--paper)" />
      <rect x="11" y="11" width="4" height="4" rx="1" fill="var(--paper)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">Kinetix</span>
    </span>
  );
}
