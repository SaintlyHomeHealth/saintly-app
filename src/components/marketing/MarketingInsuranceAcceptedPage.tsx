import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { InsuranceAcceptedSection } from "./InsuranceAcceptedSection";
import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import { PHONE_DISPLAY, TEL } from "./marketing-constants";
import { BG_CREAM_GOLD, BTN_DARK_OUTLINE, BTN_GOLD, CREAM, NAVY, SectionEyebrow } from "./marketing-design";
import { MARKETING_NAV_INSURANCE_PAGE } from "./marketing-nav";
import { HaloMark } from "./MarketingHaloMark";

export function MarketingInsuranceAcceptedPage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_INSURANCE_PAGE} />

      <section
        className="relative overflow-hidden px-5 pb-4 pt-10 sm:px-7 sm:pb-6 sm:pt-14 lg:px-10"
        style={{ background: BG_CREAM_GOLD }}
        aria-labelledby="insurance-page-hero-heading"
      >
        <div
          className="pointer-events-none absolute -right-32 -top-24 h-[32rem] w-[32rem] rounded-full bg-[#FFC72C]/25 blur-[130px]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={92} height={28} />
          <SectionEyebrow>Saintly Home Health · Arizona</SectionEyebrow>
          <h1
            id="insurance-page-hero-heading"
            className="mt-5 text-balance text-[clamp(2.1rem,5vw,3.35rem)] font-semibold leading-[1.06] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Insurance &amp; Plans We Accept
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.12rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            We work with Medicare, Medicaid, Medicare Advantage, and authorized network partners.
            Status labels reflect current participation — we verify eligibility and authorization
            before care begins.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-5">
            <Link href="/contact#form" className={BTN_GOLD}>
              Verify Insurance
              <ArrowRight className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            </Link>
            <a href={TEL} className={BTN_DARK_OUTLINE}>
              <Phone className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
              Call {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <InsuranceAcceptedSection id="insurance-plans" standalone showHeader={false} />

      <MarketingFinalCtaStrip />
      <MarketingSiteFooter />
      <MarketingStickyMobileCta />
    </div>
  );
}
