import Image from "next/image";

/** Matches wound care / marketing navy for logotype consistency. */
const BRAND_NAVY = "#0c1929";

const ICON_SRC = "/marketing/saintly-icon-v3.png";

type MarketingBrandLockupProps = {
  /** Controls icon and type scale (header navbar vs footer masthead). */
  variant: "header" | "footer";
  /** Optional extra wrapper classes (must keep flex horizontal lockup intact). */
  className?: string;
};

export function MarketingBrandLockup({ variant, className = "" }: MarketingBrandLockupProps) {
  const isFooter = variant === "footer";

  const iconDims = isFooter
    ? "h-[72px] w-[72px] sm:h-[84px] sm:w-[84px]"
    : "h-[62px] w-[62px] sm:h-[70px] sm:w-[70px] min-[1100px]:h-[80px] min-[1100px]:w-[80px]";
  const iconSizes = isFooter
    ? "(max-width: 640px) 72px, 84px"
    : "(max-width: 640px) 62px, (max-width: 1099px) 70px, 80px";

  const saintlyCls = isFooter
    ? [
        "block font-bold uppercase tracking-[0.08em]",
        "text-[1rem] leading-[1.08] sm:text-[1.08rem] min-[1100px]:text-[1.175rem]",
      ].join(" ")
    : [
        "block font-bold uppercase tracking-[0.08em]",
        "text-[clamp(0.9625rem,2.85vw,1rem)] leading-[1.08] sm:text-[1.06rem] min-[1100px]:text-[1.125rem]",
      ].join(" ");

  const subCls = isFooter
    ? [
        "block font-semibold uppercase tracking-[0.2em] text-slate-600",
        "text-[11px] leading-[1.35] sm:text-[11.5px] min-[1100px]:mt-1 min-[1100px]:text-[12px]",
      ].join(" ")
    : [
        "block font-semibold uppercase tracking-[0.2em] text-slate-600",
        "text-[clamp(0.5625rem,1.85vw,0.6875rem)] leading-[1.35] sm:text-[11px] min-[1100px]:mt-1 min-[1100px]:text-[12px]",
      ].join(" ");

  return (
    <span className={`inline-flex max-w-[100%] min-w-0 items-center gap-2 sm:gap-2.5 ${className}`}>
      <span className="relative inline-flex shrink-0">
        <span
          className="pointer-events-none absolute -inset-1 -z-10 rounded-full bg-[#FFC72C]/12 blur-[10px]"
          aria-hidden
        />
        <Image
          src={ICON_SRC}
          alt=""
          width={1024}
          height={1024}
          sizes={iconSizes}
          quality={95}
          priority={!isFooter}
          className={`${iconDims} object-contain`}
        />
      </span>

      <span className="flex min-w-0 flex-col justify-center gap-1">
        <span className={saintlyCls} style={{ color: BRAND_NAVY }}>
          Saintly
        </span>
        <span className={subCls}>Home Health</span>
      </span>
    </span>
  );
}
