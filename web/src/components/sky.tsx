import clsx from "clsx";

/** Deterministic PRNG so the server and client render the same sky. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
  twinkle: boolean;
  delay: number;
}

function makeStars(count: number, seed: number): Star[] {
  const rand = rng(seed);
  return Array.from({ length: count }, () => {
    const big = rand() > 0.94;
    return {
      x: rand() * 1600,
      y: rand() * 900,
      r: big ? 1.1 + rand() * 0.5 : 0.35 + rand() * 0.55,
      o: big ? 0.5 + rand() * 0.3 : 0.12 + rand() * 0.38,
      twinkle: rand() > 0.82,
      delay: rand() * 6,
    };
  });
}

const STARS = makeStars(220, 20261010);

/** A low-contrast star-field. Fills its positioned parent. */
export function StarField({ className, density = 1 }: { className?: string; density?: number }) {
  const stars = density >= 1 ? STARS : STARS.filter((_, i) => i % Math.round(1 / density) === 0);
  return (
    <svg
      aria-hidden
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      className={clsx("pointer-events-none absolute inset-0 h-full w-full", className)}
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="#fff"
          opacity={s.o}
          className={s.twinkle ? "kx-twinkle" : undefined}
          style={s.twinkle ? { animationDelay: `${s.delay}s` } : undefined}
        />
      ))}
    </svg>
  );
}

/**
 * Soft, dark ridgelines along the bottom edge — layered silhouettes with a faint rim of light,
 * fading into the page. Purely decorative and low-contrast.
 */
export function Horizon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1600 420"
      preserveAspectRatio="none"
      className={clsx("pointer-events-none absolute inset-x-0 bottom-0 h-[44%] w-full", className)}
    >
      <defs>
        <linearGradient id="kx-ridge-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#23252c" stopOpacity="0.75" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="kx-ridge-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15161b" stopOpacity="0.95" />
          <stop offset="0.7" stopColor="#000" stopOpacity="1" />
        </linearGradient>
        <radialGradient id="kx-glow" cx="0.5" cy="1" r="0.75">
          <stop offset="0" stopColor="#3a3d47" stopOpacity="0.32" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="420" fill="url(#kx-glow)" />
      <path
        d="M0 210 C120 180 210 150 320 168 C420 184 470 120 560 112 C660 104 720 170 820 150 C920 130 980 70 1080 82 C1180 94 1240 160 1330 150 C1420 140 1500 120 1600 140 L1600 420 L0 420 Z"
        fill="url(#kx-ridge-far)"
      />
      <path
        d="M0 210 C120 180 210 150 320 168 C420 184 470 120 560 112 C660 104 720 170 820 150 C920 130 980 70 1080 82 C1180 94 1240 160 1330 150 C1420 140 1500 120 1600 140"
        stroke="#fff"
        strokeOpacity="0.07"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="M0 300 C110 268 200 250 300 262 C400 274 470 236 560 224 C660 212 760 262 860 252 C960 242 1040 200 1140 210 C1240 220 1320 262 1420 250 C1500 240 1560 226 1600 230 L1600 420 L0 420 Z"
        fill="url(#kx-ridge-near)"
      />
      <path
        d="M0 300 C110 268 200 250 300 262 C400 274 470 236 560 224 C660 212 760 262 860 252 C960 242 1040 200 1140 210 C1240 220 1320 262 1420 250 C1500 240 1560 226 1600 230"
        stroke="#fff"
        strokeOpacity="0.05"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

/** Star-field above a horizon: the backdrop for the hero, auth pages and closing sections. */
export function Sky({ className, horizon = true }: { className?: string; horizon?: boolean }) {
  return (
    <div aria-hidden className={clsx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <StarField />
      {horizon ? <Horizon /> : null}
    </div>
  );
}
