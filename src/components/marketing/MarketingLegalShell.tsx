"use client";

import type { ReactNode } from "react";
import { CalendarDays, ScrollText, ShieldCheck } from "lucide-react";

import { HaloMark } from "./MarketingHaloMark";
import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import {
  BG_CREAM_GOLD,
  CREAM,
  GoldIconTile,
  NAVY,
  SectionEyebrow,
} from "./marketing-design";
import type { MarketingNavLink } from "./marketing-nav";
import "./marketing-home.css";

type MarketingLegalShellProps = {
  navLinks: readonly MarketingNavLink[];
  title: string;
  effectiveDateLabel: string;
  children: ReactNode;
};

/**
 * Tailwind arbitrary descendant selectors that gently upgrade the typography
 * of `.shh-legal-doc` content (h2/h3/p/ul/li/a) so legal pages match the
 * premium cream/gold design system without rewriting the legal copy itself.
 */
const LEGAL_PROSE_OVERRIDES = [
  // Lead paragraph
  "[&_.shh-legal-lead]:text-[1.12rem]",
  "[&_.shh-legal-lead]:leading-[1.7]",
  "[&_.shh-legal-lead]:text-slate-700",
  "[&_.shh-legal-lead]:mb-8",

  // h2 — promote from 1.125rem to a real section heading
  "[&_.shh-legal-doc_h2]:text-[1.45rem]",
  "[&_.shh-legal-doc_h2]:font-semibold",
  "[&_.shh-legal-doc_h2]:tracking-[-0.01em]",
  "[&_.shh-legal-doc_h2]:text-[#0c1929]",
  "[&_.shh-legal-doc_h2]:mt-12",
  "[&_.shh-legal-doc_h2]:mb-4",
  "[&_.shh-legal-doc_h2]:scroll-mt-24",
  "sm:[&_.shh-legal-doc_h2]:text-[1.55rem]",

  // h3 (used in some content files)
  "[&_.shh-legal-doc_h3]:text-[1.18rem]",
  "[&_.shh-legal-doc_h3]:font-semibold",
  "[&_.shh-legal-doc_h3]:text-[#0c1929]",
  "[&_.shh-legal-doc_h3]:mt-8",
  "[&_.shh-legal-doc_h3]:mb-3",

  // Paragraphs — better line height + readable color
  "[&_.shh-legal-doc_p]:text-[1.02rem]",
  "[&_.shh-legal-doc_p]:leading-[1.72]",
  "[&_.shh-legal-doc_p]:text-slate-700",
  "[&_.shh-legal-doc_p]:my-4",
  "sm:[&_.shh-legal-doc_p]:text-[1.06rem]",

  // Lists — better spacing
  "[&_.shh-legal-doc_ul]:my-5",
  "[&_.shh-legal-doc_ul]:pl-6",
  "[&_.shh-legal-doc_ul]:space-y-2",
  "[&_.shh-legal-doc_li]:text-[1.02rem]",
  "[&_.shh-legal-doc_li]:leading-[1.65]",
  "[&_.shh-legal-doc_li]:text-slate-700",
  "sm:[&_.shh-legal-doc_li]:text-[1.06rem]",

  // Strong / emphasis
  "[&_.shh-legal-doc_strong]:font-semibold",
  "[&_.shh-legal-doc_strong]:text-[#0c1929]",

  // Anchors — gold underline like the rest of the premium site
  "[&_.shh-legal-doc_a]:font-semibold",
  "[&_.shh-legal-doc_a]:text-amber-700",
  "[&_.shh-legal-doc_a]:underline-offset-2",
  "[&_.shh-legal-doc_a:hover]:underline",

  // Widen the inner column inside the (otherwise 42rem-capped) card
  "[&_.shh-legal-doc]:max-w-none!",
  "[&_.shh-legal-doc]:mx-0!",
  "[&_.shh-legal-doc]:px-0!",
  "[&_.shh-legal-doc]:pb-0!",
].join(" ");

export function MarketingLegalShell({
  navLinks,
  title,
  effectiveDateLabel,
  children,
}: MarketingLegalShellProps) {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={navLinks} />

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section
        id="top"
        className="relative overflow-hidden"
        aria-labelledby="legal-doc-title"
        style={{ background: BG_CREAM_GOLD }}
      >
        <div
          className="pointer-events-none absolute -right-32 -top-24 h-[36rem] w-[36rem] rounded-full bg-[#FFC72C]/28 blur-[140px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-40 top-24 h-[28rem] w-[28rem] rounded-full bg-sky-300/22 blur-[130px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-[60rem] px-5 pb-16 pt-12 text-center sm:px-7 sm:pb-20 sm:pt-16 md:pb-24 md:pt-20 lg:pb-28 lg:pt-24">
          <div className="mx-auto mb-7 inline-flex flex-col items-center">
            <HaloMark className="mb-3 block" width={92} height={28} />
            <SectionEyebrow>Legal · Saintly Home Health</SectionEyebrow>
          </div>

          <h1
            id="legal-doc-title"
            className="mx-auto max-w-[40rem] text-balance text-[clamp(2.6rem,5.5vw,4rem)] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[clamp(3rem,5vw,4.5rem)] lg:text-[clamp(3.4rem,4.6vw,5rem)]"
            style={{ color: NAVY }}
          >
            {title}
          </h1>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/95 px-4 py-2 text-[13.5px] font-semibold text-[#0c1929] shadow-[0_10px_26px_-14px_rgba(245,180,0,0.40)] backdrop-blur-sm sm:text-[14px]">
              <CalendarDays className="h-4 w-4 text-amber-600" strokeWidth={2.25} aria-hidden />
              Effective Date: {effectiveDateLabel}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/95 px-4 py-2 text-[13.5px] font-semibold text-[#0c1929] shadow-[0_10px_26px_-14px_rgba(245,180,0,0.40)] backdrop-blur-sm sm:text-[14px]">
              <ShieldCheck className="h-4 w-4 text-amber-600" strokeWidth={2.25} aria-hidden />
              Saintly Home Health LLC
            </span>
          </div>
        </div>

        <div className="relative z-[3] mt-2 w-full overflow-hidden leading-[0]" aria-hidden>
          <svg
            className="-mb-px block h-[clamp(2.25rem,5vw,3.25rem)] w-full text-[#fffaf0]"
            viewBox="0 0 1440 40"
            preserveAspectRatio="none"
          >
            <path
              fill="currentColor"
              d="M0 40V18C180 38 540 12 720 26C930 41 1170 3 1440 20V40H0Z"
            />
          </svg>
        </div>
      </section>

      {/* ─── Premium content card ─────────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 pb-[clamp(4rem,9vw,6.5rem)] pt-2 sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
      >
        <article
          className={`relative mx-auto w-full min-w-0 max-w-[60rem] rounded-[1.85rem] border border-amber-100/80 bg-white/95 px-6 py-10 shadow-[0_38px_90px_-32px_rgba(15,23,42,0.28)] ring-1 ring-amber-100/40 sm:px-10 sm:py-12 md:px-14 md:py-14 lg:px-16 lg:py-16 ${LEGAL_PROSE_OVERRIDES}`}
        >
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#FFC72C]/15 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-12 bottom-16 h-44 w-44 rounded-full bg-sky-200/35 blur-2xl"
            aria-hidden
          />

          <header className="relative mb-9 flex flex-col gap-4 border-b border-amber-100/70 pb-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <GoldIconTile size="md">
                <ScrollText className="h-7 w-7" strokeWidth={1.9} />
              </GoldIconTile>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Saintly · Legal
                </p>
                <p
                  className="mt-1 text-[1.1rem] font-semibold leading-snug sm:text-[1.18rem]"
                  style={{ color: NAVY }}
                >
                  {title}
                </p>
              </div>
            </div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Effective {effectiveDateLabel}
            </p>
          </header>

          <div className="relative shh-legal-doc">{children}</div>
        </article>
      </section>

      <MarketingFinalCtaStrip />
      <MarketingSiteFooter />

      <MarketingStickyMobileCta />
    </div>
  );
}
