import clsx from "clsx";

/**
 * The Kinetix mark: three chain-of-custody tiles cut from a verdigris block, with a fourth
 * "leading" tile breaking forward in the signal accent — evidence in motion, which is the
 * idea the product is built around.
 */
export function LogoMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" fill="var(--vg)" />
      <rect x="5" y="5" width="4.5" height="4.5" rx="1.25" fill="var(--on-vg)" opacity="0.95" />
      <rect x="5" y="14.5" width="4.5" height="4.5" rx="1.25" fill="var(--on-vg)" opacity="0.95" />
      <rect x="14.5" y="14.5" width="4.5" height="4.5" rx="1.25" fill="var(--on-vg)" opacity="0.95" />
      {/* The leading tile, lifted forward in the electric signal colour. */}
      <rect x="14.5" y="5" width="4.5" height="4.5" rx="1.25" fill="var(--signal)" />
    </svg>
  );
}

export function Wordmark({
  size = 15,
  markSize,
  className,
}: {
  size?: number;
  markSize?: number;
  className?: string;
}) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <LogoMark size={markSize ?? Math.round(size * 1.35)} />
      <span
        className="font-display font-semibold tracking-[-0.02em]"
        style={{ fontSize: size, lineHeight: 1 }}
      >
        Kinetix
      </span>
    </span>
  );
}
