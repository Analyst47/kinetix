import clsx from "clsx";

/**
 * The KinetixZero mark: a "zero" ring, and a traced path from a source node inside it out to a
 * node that breaks through the ring. It is the product in one glyph — following untrusted input
 * to the point where it escapes. Drawn in currentColor so it is white on the black public site
 * and in dark mode, and black in the light app theme; `tile` renders the white-on-black app icon.
 */
export function LogoMark({
  size = 22,
  className,
  tile,
}: {
  size?: number;
  className?: string;
  tile?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={clsx("shrink-0", className)}
    >
      {tile ? <rect width="24" height="24" rx="6" fill="#000" /> : null}
      <g
        stroke={tile ? "#fff" : "currentColor"}
        fill={tile ? "#fff" : "currentColor"}
        transform={tile ? "translate(2.4 2.4) scale(0.8)" : undefined}
      >
        {/* The ring, open where the path breaks through it. */}
        <path
          d="M19.935 8.954 A8.5 8.5 0 1 1 15.046 4.065"
          fill="none"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        {/* The traced path, source to exit. */}
        <path d="M8.6 15.4 L18 6" fill="none" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="8.6" cy="15.4" r="1.9" stroke="none" />
        <circle cx="18" cy="6" r="2.6" stroke="none" />
      </g>
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
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize ?? Math.round(size * 1.45)} />
      <span
        className="font-display font-semibold tracking-[-0.03em]"
        style={{ fontSize: size, lineHeight: 1 }}
      >
        Kinetix<span className="text-muted">Zero</span>
      </span>
    </span>
  );
}
