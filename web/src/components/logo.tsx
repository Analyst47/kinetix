import clsx from "clsx";

/**
 * The Kinetix mark: an ascending path of three nodes — source → flow → sink — with the final
 * node lit in the signal accent. It is the product in one glyph: tracing the path an attacker
 * would take to the target. One colour-safe, scales cleanly, and matches the data-flow visuals
 * used across the site.
 */
export function LogoMark({
  size = 22,
  className,
  interactive,
}: {
  size?: number;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="var(--vg)" />
      <path
        d="M6.6 17.4 L12 12 L17.4 6.6"
        stroke="var(--on-vg)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <circle cx="6.6" cy="17.4" r="2" fill="var(--on-vg)" />
      <circle cx="12" cy="12" r="2" fill="var(--on-vg)" />
      <circle
        cx="17.4"
        cy="6.6"
        r="2.7"
        fill="var(--signal)"
        className={clsx(
          interactive &&
            "origin-center transition-transform duration-300 ease-out group-hover:translate-x-[0.6px] group-hover:-translate-y-[0.6px]",
        )}
      />
    </svg>
  );
}

export function Wordmark({
  size = 15,
  markSize,
  className,
  interactive,
}: {
  size?: number;
  markSize?: number;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <span className={clsx("group inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize ?? Math.round(size * 1.4)} interactive={interactive} />
      <span
        className="font-display font-semibold tracking-[-0.02em]"
        style={{ fontSize: size, lineHeight: 1 }}
      >
        Kinetix
      </span>
    </span>
  );
}
