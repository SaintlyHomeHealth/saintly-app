import { ChevronDown, HelpCircle, Mail, Phone, Printer } from "lucide-react";
import { FAQ_CATEGORIES } from "./marketing-faq-content";
import { HaloMark } from "./MarketingHaloMark";
import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import {
  EMAIL_INTAKE,
  FAX_DISPLAY,
  MAILTO_INTAKE,
  PHONE_DISPLAY,
  TEL,
} from "./marketing-constants";
import {
  BG_CREAM_GOLD,
  BG_CREAM_SOFT,
  BTN_DARK_OUTLINE,
  BTN_GOLD,
  CREAM,
  FAX_TEL,
  GoldIconTile,
  NAVY,
  SectionEyebrow,
  TrustPill,
} from "./marketing-design";
import { MARKETING_NAV_FAQ_PAGE } from "./marketing-nav";

const TRUST_PILLS = [
  "Plain-Language Help",
  "Greater Phoenix",
  "Tempe-Based",
  "Medicare-Certified",
] as const;

const MAILTO_GENERAL = `${MAILTO_INTAKE}?subject=${encodeURIComponent("Question — Saintly Home Health")}`;

export function MarketingFaqPage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_FAQ_PAGE} />

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="faq-hero-heading"
        style={{ background: BG_CREAM_GOLD }}
      >
        <div
          className="pointer-events-none absolute -right-32 -top-24 h-[40rem] w-[40rem] rounded-full bg-[#FFC72C]/30 blur-[140px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-48 top-24 h-[32rem] w-[32rem] rounded-full bg-sky-300/22 blur-[130px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-[88rem] px-5 pb-20 pt-12 text-center sm:px-7 sm:pb-24 sm:pt-16 md:pb-28 md:pt-20 lg:px-10 lg:pb-32 lg:pt-24">
          <div className="mx-auto mb-9 max-w-[44rem]">
            <HaloMark className="mx-auto mb-3 block" width={92} height={28} />
            <SectionEyebrow>Help center · Saintly Home Health</SectionEyebrow>
          </div>

          <h1
            id="faq-hero-heading"
            className="mx-auto max-w-[44rem] text-balance text-[clamp(2.6rem,5.6vw,4.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[clamp(3rem,5.4vw,4.85rem)] lg:text-[clamp(3.4rem,5vw,5.5rem)]"
            style={{ color: NAVY }}
          >
            Frequently asked questions about home health
          </h1>

          <p className="mx-auto mt-8 max-w-[38rem] text-[1.22rem] leading-[1.6] text-slate-700 sm:text-[1.32rem] sm:leading-[1.62] md:text-[1.42rem]">
            Quick answers about eligibility, Medicare coverage, services at home, referrals,
            and how to get started with Saintly Home Health.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap sm:gap-5">
            <a href={TEL} className={BTN_GOLD}>
              <span
                className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-0 rounded-full bg-[#FFC72C]/25 blur-[28px]"
                aria-hidden
              />
              <Phone className="relative h-[1.4rem] w-[1.4rem]" strokeWidth={2.25} aria-hidden />
              <span className="relative">Call {PHONE_DISPLAY}</span>
            </a>
            <a href="/contact#form" className={BTN_DARK_OUTLINE}>
              Talk to Intake
              <span className="text-lg leading-none text-[#0c1929]" aria-hidden>
                →
              </span>
            </a>
          </div>

          <ul className="mt-10 flex flex-wrap justify-center gap-2.5 sm:gap-3">
            {TRUST_PILLS.map((pill) => (
              <li key={pill}>
                <TrustPill label={pill} />
              </li>
            ))}
          </ul>
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

      {/* ─── Category jump nav ─────────────────────────────────────────── */}
      <nav
        className="relative mx-auto -mt-2 w-full max-w-[80rem] px-5 pt-10 sm:px-7 lg:px-10"
        aria-label="FAQ categories"
      >
        <div className="rounded-[1.5rem] border border-amber-100/80 bg-white/95 px-5 py-5 shadow-[0_24px_60px_-26px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/40 sm:px-7 sm:py-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Jump to:
          </p>
          <ul className="mt-3 flex flex-wrap gap-2.5 sm:gap-3">
            {FAQ_CATEGORIES.map((cat) => (
              <li key={cat.id}>
                <a
                  href={`#${cat.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/70 px-4 py-2 text-[14px] font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
                >
                  {cat.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* ─── FAQ categories ─────────────────────────────────────────────── */}
      {FAQ_CATEGORIES.map((cat, ci) => (
        <section
          key={cat.id}
          id={cat.id}
          className="relative scroll-mt-[5.5rem] overflow-x-hidden px-5 py-[clamp(4rem,10vw,6.5rem)] sm:px-7 lg:px-10"
          aria-labelledby={`faq-cat-${cat.id}`}
          style={ci % 2 === 0 ? { backgroundColor: CREAM } : { background: BG_CREAM_SOFT }}
        >
          <div className="relative mx-auto max-w-3xl text-center">
            <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
            <SectionEyebrow>FAQ category</SectionEyebrow>
            <h2
              id={`faq-cat-${cat.id}`}
              className="mt-5 text-balance text-[clamp(1.85rem,4.2vw,2.85rem)] font-semibold leading-[1.1] tracking-[-0.025em]"
              style={{ color: NAVY }}
            >
              {cat.title}
            </h2>
          </div>

          <div className="relative mx-auto mt-12 max-w-3xl space-y-5">
            {cat.items.map((item, i) => (
              <details
                key={item.q}
                {...(ci === 0 && i === 0 ? { open: true } : {})}
                className="group overflow-hidden rounded-[1.5rem] border border-amber-100/80 bg-white/95 shadow-[0_24px_58px_-28px_rgba(15,23,42,0.2)] ring-1 ring-amber-100/40 transition-shadow open:shadow-[0_32px_72px_-28px_rgba(245,180,0,0.30)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-[1.5rem] px-7 py-6 outline-none transition-colors hover:bg-amber-50/60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf0] sm:px-9 sm:py-7">
                  <span className="text-left text-[1.16rem] font-semibold leading-[1.4] text-[#0c1929] sm:text-[1.24rem]">
                    {item.q}
                  </span>
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-200/80 bg-amber-50 text-amber-700 transition duration-300 group-open:rotate-180 group-open:border-amber-300 group-open:bg-gradient-to-br group-open:from-[#FFC72C] group-open:to-[#F5B400] group-open:text-[#0c1929]"
                    aria-hidden
                  >
                    <ChevronDown className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                  </span>
                </summary>
                <div className="border-t border-amber-100/70 px-7 pb-7 pt-5 sm:px-9 sm:pb-8 sm:pt-6">
                  <p className="text-[1.1rem] leading-[1.7] text-slate-700 sm:text-[1.16rem] sm:leading-[1.72]">
                    {item.a}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      {/* ─── Still have questions ─────────────────────────────────────── */}
      <section
        id="still-questions"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="help-block-title"
        style={{ backgroundColor: CREAM }}
      >
        <div
          className="relative mx-auto max-w-[80rem] overflow-hidden rounded-[2.25rem] border border-amber-100/90 px-9 py-14 shadow-[0_54px_120px_-42px_rgba(15,23,42,0.34)] sm:px-14 sm:py-16 md:px-[4.25rem] md:py-[4.5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-28 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[#FFC72C]/[0.22] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16">
            <div className="min-w-0">
              <HaloMark className="mb-4 block" width={92} height={28} />
              <SectionEyebrow>Still have questions?</SectionEyebrow>
              <h2
                id="help-block-title"
                className="mt-5 text-balance text-[clamp(1.95rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.1rem,3.5vw,3.35rem)]"
                style={{ color: NAVY }}
              >
                We&apos;re here to help — no pressure
              </h2>
              <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-800 sm:text-[1.28rem]">
                Reach us the way that works best for you. Our intake team in Tempe answers
                phone, fax, and email during business hours.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                <a href={TEL} className={BTN_GOLD}>
                  <span
                    className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-0 rounded-full bg-[#FFC72C]/25 blur-[28px]"
                    aria-hidden
                  />
                  <Phone className="relative h-[1.3rem] w-[1.3rem]" strokeWidth={2.25} aria-hidden />
                  <span className="relative">Call {PHONE_DISPLAY}</span>
                </a>
                <a href="/contact#form" className={BTN_DARK_OUTLINE}>
                  Send a message
                  <span className="text-lg leading-none text-[#0c1929]" aria-hidden>
                    →
                  </span>
                </a>
              </div>
            </div>

            <ul className="relative min-w-0 space-y-3.5 sm:space-y-4">
              <li>
                <a
                  href={TEL}
                  className="flex items-start gap-4 rounded-2xl border border-white/95 bg-white/95 px-6 py-5 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition hover:border-amber-200/80"
                >
                  <GoldIconTile size="sm">
                    <Phone className="h-5 w-5" strokeWidth={2.25} />
                  </GoldIconTile>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Call us
                    </span>
                    <span
                      className="mt-1 block text-[1.18rem] font-semibold leading-snug sm:text-[1.24rem]"
                      style={{ color: NAVY }}
                    >
                      {PHONE_DISPLAY}
                    </span>
                  </span>
                </a>
              </li>
              <li>
                <a
                  href={FAX_TEL}
                  className="flex items-start gap-4 rounded-2xl border border-white/95 bg-white/95 px-6 py-5 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition hover:border-amber-200/80"
                >
                  <GoldIconTile size="sm">
                    <Printer className="h-5 w-5" strokeWidth={2.25} />
                  </GoldIconTile>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Fax referral
                    </span>
                    <span
                      className="mt-1 block text-[1.18rem] font-semibold leading-snug sm:text-[1.24rem]"
                      style={{ color: NAVY }}
                    >
                      {FAX_DISPLAY}
                    </span>
                  </span>
                </a>
              </li>
              <li>
                <a
                  href={MAILTO_GENERAL}
                  className="flex items-start gap-4 rounded-2xl border border-white/95 bg-white/95 px-6 py-5 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition hover:border-amber-200/80"
                >
                  <GoldIconTile size="sm">
                    <Mail className="h-5 w-5" strokeWidth={2.25} />
                  </GoldIconTile>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Email us
                    </span>
                    <span
                      className="mt-1 block break-words text-[1.06rem] font-semibold leading-snug sm:text-[1.12rem]"
                      style={{ color: NAVY }}
                    >
                      {EMAIL_INTAKE}
                    </span>
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="/contact#form"
                  className="flex items-start gap-4 rounded-2xl border border-white/95 bg-white/95 px-6 py-5 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition hover:border-amber-200/80"
                >
                  <GoldIconTile size="sm">
                    <HelpCircle className="h-5 w-5" strokeWidth={2.25} />
                  </GoldIconTile>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Contact intake
                    </span>
                    <span
                      className="mt-1 block text-[1.18rem] font-semibold leading-snug sm:text-[1.24rem]"
                      style={{ color: NAVY }}
                    >
                      Message our team
                    </span>
                  </span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <MarketingFinalCtaStrip />

      <MarketingSiteFooter />

      <MarketingStickyMobileCta />
    </div>
  );
}
