"use client";

import { PHONE_DISPLAY, TEL } from "./marketing-constants";

type MarketingStickyMobileCtaProps = {
  /** Overrides the second button (defaults keep existing site behavior everywhere). */
  secondaryHref?: string;
  secondaryLabel?: string;
};

/** Fixed bar below md — padded for iOS safe area */
export function MarketingStickyMobileCta({
  secondaryHref = "/contact#form",
  secondaryLabel = "Request intake help",
}: MarketingStickyMobileCtaProps) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      role="region"
      aria-label="Quick contact"
    >
      <div className="mx-auto flex max-w-lg gap-2.5 pb-0.5">
        <a
          className="flex-1 rounded-full bg-gradient-to-r from-[#1d4ed8] to-[#0ea5e9] py-3.5 text-center text-sm font-semibold leading-tight text-white shadow-md shadow-blue-500/25"
          href={TEL}
        >
          Call {PHONE_DISPLAY}
        </a>
        <a
          className="flex-1 rounded-full border-2 border-blue-600/85 bg-white py-3.5 text-center text-sm font-semibold leading-tight text-blue-800"
          href={secondaryHref}
        >
          {secondaryLabel}
        </a>
      </div>
    </div>
  );
}
