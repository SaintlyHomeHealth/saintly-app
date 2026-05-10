import type { ReactNode } from "react";

/* ──────────────────────────────────────────────────────────────────────────
 * Saintly Home Health — premium cream/gold marketing design system.
 *
 * Single source of truth for every premium marketing surface (Physical
 * Therapy, Home, Wound Care). Shared constants + atoms keep gold tiles,
 * eyebrows, gradients, and CTA buttons identical across pages.
 * ────────────────────────────────────────────────────────────────────────── */

/** Saintly brand colors. */
export const SAINTLY_COLORS = {
  navy: "#0c1929",
  gold: "#FFC72C",
  goldDark: "#F5B400",
  cream: "#fffaf0",
} as const;

export const NAVY = SAINTLY_COLORS.navy;
export const GOLD = SAINTLY_COLORS.gold;
export const GOLD_DARK = SAINTLY_COLORS.goldDark;
export const CREAM = SAINTLY_COLORS.cream;

/* ── Section/panel backgrounds ───────────────────────────────────────────── */

/** Warm cream/gold gradient — hero & Medicare-style premium panels. */
export const BG_CREAM_GOLD =
  "radial-gradient(85% 70% at 100% 0%, rgba(255,199,44,0.30) 0%, rgba(255,199,44,0) 55%), radial-gradient(60% 55% at 0% 100%, rgba(186,230,253,0.55) 0%, rgba(186,230,253,0) 60%), linear-gradient(145deg, #fff8e7 0%, #fffaf0 38%, #f3f8ff 100%)";

/** Softer cream variant — for full-bleed alternating sections. */
export const BG_CREAM_SOFT =
  "radial-gradient(70% 60% at 0% 0%, rgba(186,230,253,0.36) 0%, rgba(186,230,253,0) 55%), radial-gradient(80% 60% at 100% 100%, rgba(255,199,44,0.16) 0%, rgba(255,199,44,0) 55%), linear-gradient(180deg, #fffdf6 0%, #f9f3e3 100%)";

/** Cream/cool variant — alternation (process, FAQ, etc.). */
export const BG_CREAM_COOL =
  "radial-gradient(85% 70% at 0% 0%, rgba(255,199,44,0.18) 0%, rgba(255,199,44,0) 55%), radial-gradient(80% 70% at 100% 100%, rgba(186,230,253,0.50) 0%, rgba(186,230,253,0) 55%), linear-gradient(180deg, #fffaf0 0%, #f3f8ff 100%)";

/** Inner panel background — used for premium rounded containers on top of section bg. */
export const BG_PANEL_CREAM =
  "radial-gradient(75% 60% at 100% 0%, rgba(255,199,44,0.22) 0%, rgba(255,199,44,0) 55%), radial-gradient(60% 55% at 0% 100%, rgba(186,230,253,0.42) 0%, rgba(186,230,253,0) 60%), linear-gradient(145deg, #fffdf6 0%, #fffaf0 40%, #f6f1e2 100%)";

/** Final-CTA dark navy background with gold halo glows. */
export const BG_DARK_GOLD =
  "radial-gradient(75% 60% at 8% 50%, rgba(255,199,44,0.22) 0%, rgba(255,199,44,0) 55%), radial-gradient(60% 50% at 100% -10%, rgba(255,199,44,0.16) 0%, rgba(255,199,44,0) 60%), linear-gradient(135deg, #0a1322 0%, #0c1929 50%, #08111e 100%)";

/* ── CTA buttons ─────────────────────────────────────────────────────────── */

/** Gold primary CTA — black text, soft amber shadow, lift on hover. */
export const BTN_GOLD =
  "group relative inline-flex min-h-[78px] min-w-[280px] items-center justify-center gap-2.5 rounded-full bg-[#FFC72C] px-11 py-[1.2rem] text-[20px] font-semibold tracking-tight text-black shadow-[0_24px_50px_-14px_rgba(245,180,0,0.55)] ring-1 ring-amber-200/80 transition hover:-translate-y-0.5 hover:bg-[#F5B400] hover:shadow-[0_30px_60px_-12px_rgba(245,180,0,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c1929] md:text-[21px] xl:text-[22px]";

/** Smaller compact gold pill — for inline CTAs (service area row, etc.). */
export const BTN_GOLD_SM =
  "group relative inline-flex min-h-[60px] items-center justify-center gap-2 rounded-full bg-[#FFC72C] px-7 py-3.5 text-[16px] font-semibold tracking-tight text-black shadow-[0_18px_36px_-12px_rgba(245,180,0,0.55)] ring-1 ring-amber-200/80 transition hover:-translate-y-0.5 hover:bg-[#F5B400] hover:shadow-[0_22px_44px_-10px_rgba(245,180,0,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c1929] sm:text-[17px]";

/** Dark outline secondary CTA — for cream sections. */
export const BTN_DARK_OUTLINE =
  "inline-flex min-h-[78px] min-w-[280px] items-center justify-center gap-2.5 rounded-full border-2 border-[#0c1929]/85 bg-white/95 px-11 py-[1.2rem] text-[20px] font-semibold tracking-tight text-[#0c1929] shadow-[0_18px_40px_-18px_rgba(15,23,42,0.22)] backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[#0c1929] hover:bg-white md:text-[21px] xl:text-[22px]";

/** White outlined CTA used on the dark final-CTA band. */
export const BTN_OUTLINE_ON_DARK =
  "inline-flex min-h-[76px] min-w-[280px] items-center justify-center gap-2.5 rounded-full border-2 border-white/65 bg-white/[0.06] px-11 py-[1.125rem] text-[20px] font-semibold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-sm transition hover:bg-white/[0.16] md:text-[21px] lg:text-[22px]";

/* ── Card classes ────────────────────────────────────────────────────────── */

/** Premium white card with amber ring + subtle shadow. */
export const CARD_PREMIUM =
  "relative flex h-full flex-col gap-6 overflow-hidden rounded-[1.75rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9";

/* ── Atoms ───────────────────────────────────────────────────────────────── */

/** Gold gradient icon tile — unified across hero badges, cards, and bullets. */
export function GoldIconTile({
  children,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "lg"
      ? "h-16 w-16 rounded-2xl"
      : size === "sm"
        ? "h-11 w-11 rounded-xl"
        : "h-14 w-14 rounded-2xl";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-[#FFC72C] to-[#F5B400] text-[#0c1929] shadow-[0_14px_30px_-12px_rgba(245,180,0,0.55)] ring-1 ring-amber-200/80 ${dims} ${className}`}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** Saintly amber section eyebrow — uppercase, tracked, branded. */
export function SectionEyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[14px] font-semibold uppercase tracking-[0.3em] text-amber-700 sm:text-[14.5px] ${className}`}
    >
      {children}
    </p>
  );
}

/** Trust pill chip — gold border + amber check, used in heroes. */
export function TrustPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/90 px-4 py-2.5 text-[13.5px] font-semibold text-[#0c1929] shadow-[0_10px_26px_-14px_rgba(245,180,0,0.40)] backdrop-blur-sm sm:text-[14px]">
      <svg
        className="h-4 w-4 shrink-0 text-amber-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      {label}
    </span>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Telephone (digits-only +1) for `tel:` href on the local fax line. */
export const FAX_TEL = "tel:+14803934119";
