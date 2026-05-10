/**
 * Shared Saintly halo accent — the small gold ellipse arc used above section eyebrows.
 * Defined once so every marketing surface (homepage, service pages, CTA bands, etc.) uses
 * the exact same stroke, color, and glow language.
 */
export function HaloMark({
  className = "",
  width = 88,
  height = 28,
  glow = true,
}: {
  className?: string;
  width?: number;
  height?: number;
  glow?: boolean;
}) {
  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ width, height }}
      aria-hidden
    >
      {glow ? (
        <span className="absolute inset-0 -z-0 rounded-full bg-[#FFC72C]/30 blur-[14px]" />
      ) : null}
      <svg viewBox="0 0 88 28" width={width} height={height} fill="none" className="relative z-10">
        <ellipse cx="44" cy="14" rx="40" ry="9" stroke="#FFC72C" strokeOpacity="0.30" strokeWidth="1.2" />
        <ellipse cx="44" cy="14" rx="36" ry="7" stroke="#F5B400" strokeOpacity="0.92" strokeWidth="1.7" />
      </svg>
    </span>
  );
}
