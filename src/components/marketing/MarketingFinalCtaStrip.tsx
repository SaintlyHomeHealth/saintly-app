import { Mail, Phone, Printer } from "lucide-react";
import {
  EMAIL_INTAKE,
  FAX_DISPLAY,
  MAILTO_INTAKE,
  PHONE_DISPLAY,
  TEL,
} from "./marketing-constants";
import { BG_DARK_GOLD, BTN_GOLD, BTN_OUTLINE_ON_DARK, FAX_TEL } from "./marketing-design";

export type MarketingFinalCtaVariant = "default" | "referrals";

type MarketingFinalCtaStripProps = {
  variant?: MarketingFinalCtaVariant;
};

const COPY = {
  default: {
    eyebrow: "We're here to help",
    title: "Need home health care for yourself or a loved one?",
    body: "Verify your Medicare coverage, learn about services, and get the care you deserve — call our Tempe-based team today.",
    primaryHref: TEL,
    primaryLabel: `Call or Text ${PHONE_DISPLAY}`,
    secondaryHref: "/contact#form",
    secondaryLabel: "Talk to Intake",
  },
  referrals: {
    eyebrow: "Send a referral",
    title: "Send a referral or reach intake",
    body:
      "Call, fax orders to our line, or email our team. We respond quickly during business hours and confirm receipt.",
    primaryHref: TEL,
    primaryLabel: `Call or Text ${PHONE_DISPLAY}`,
    secondaryHref: "/referrals",
    secondaryLabel: "Send a Referral",
  },
} as const;

/** Premium gold-on-navy CTA strip — matches new homepage / service-page design system. */
export function MarketingFinalCtaStrip({ variant = "default" }: MarketingFinalCtaStripProps) {
  const copy = COPY[variant];
  return (
    <section
      className="relative mx-4 my-16 overflow-x-hidden rounded-[2rem] px-7 py-[4.5rem] text-white shadow-[0_60px_128px_-46px_rgba(15,23,42,0.58)] ring-1 ring-amber-200/15 sm:mx-6 sm:px-10 sm:py-[5rem] md:mx-auto md:max-w-[86rem] md:px-16 md:py-[5.25rem] lg:my-24 lg:px-20 lg:py-[5.75rem]"
      id="intake"
      aria-labelledby="final-cta-title"
      style={{ background: BG_DARK_GOLD }}
    >
      <div
        className="pointer-events-none absolute -left-32 top-1/2 h-[30rem] w-[30rem] -translate-y-1/2 rounded-full bg-[#FFC72C]/[0.22] blur-[128px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-0 h-[24rem] w-[24rem] rounded-full bg-[#FFC72C]/[0.12] blur-[110px]"
        aria-hidden
      />

      <div className="relative flex flex-col gap-14 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div className="max-w-3xl">
          <span className="relative mb-8 inline-block h-8 w-28" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-[#FFC72C]/40 blur-[14px]" />
            <svg viewBox="0 0 100 28" fill="none" className="relative h-full w-full">
              <ellipse cx="50" cy="14" rx="46" ry="10" stroke="#FFC72C" strokeOpacity="0.45" strokeWidth="1.3" />
              <ellipse cx="50" cy="14" rx="40" ry="7" stroke="#FFC72C" strokeOpacity="0.95" strokeWidth="1.6" />
            </svg>
          </span>
          <p className="mb-4 text-[14px] font-semibold uppercase tracking-[0.3em] text-[#FFC72C] sm:text-[14.5px]">
            {copy.eyebrow}
          </p>
          <h2
            id="final-cta-title"
            className="text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[clamp(2.35rem,4vw,3.85rem)] lg:text-[clamp(2.5rem,3.5vw,4.25rem)]"
          >
            {copy.title}
          </h2>
          <p className="mt-7 max-w-2xl text-[1.3rem] leading-[1.68] text-amber-50/90 sm:text-[1.42rem] sm:leading-[1.7]">
            {copy.body}
          </p>
          <p className="mt-6 max-w-2xl text-[13px] font-semibold uppercase leading-[1.75] tracking-[0.12em] text-amber-100/85 sm:text-[14px]">
            Medicare-Certified
            <span className="mx-2 text-[#FFC72C]/95">•</span>
            AHCCCS Provider
            <span className="mx-2 text-[#FFC72C]/95">•</span>
            Greater Phoenix
          </p>
        </div>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8 lg:flex-col lg:items-stretch lg:gap-6 xl:flex-row xl:items-center xl:gap-10">
          <a href={copy.primaryHref} className={BTN_GOLD}>
            <span
              className="pointer-events-none absolute -inset-2 -z-10 rounded-full bg-[#FFC72C]/40 blur-2xl"
              aria-hidden
            />
            <Phone className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            {copy.primaryLabel}
          </a>
          <a href={copy.secondaryHref} className={BTN_OUTLINE_ON_DARK}>
            {copy.secondaryLabel}
            <span className="text-lg leading-none text-[#FFC72C]" aria-hidden>
              →
            </span>
          </a>
        </div>
      </div>

      <div className="relative mt-12 grid gap-4 border-t border-white/10 pt-9 sm:grid-cols-3 sm:gap-8">
        <a href={TEL} className="group flex items-center gap-3 text-amber-50/90 transition hover:text-white">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC72C]/15 text-[#FFC72C] ring-1 ring-[#FFC72C]/25 transition group-hover:bg-[#FFC72C]/25">
            <Phone className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-200/85">
              Phone
            </span>
            <span className="block text-[1.08rem] font-semibold leading-snug">{PHONE_DISPLAY}</span>
          </span>
        </a>
        <a
          href={MAILTO_INTAKE}
          className="group flex items-center gap-3 text-amber-50/90 transition hover:text-white"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC72C]/15 text-[#FFC72C] ring-1 ring-[#FFC72C]/25 transition group-hover:bg-[#FFC72C]/25">
            <Mail className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-200/85">
              Email
            </span>
            <span className="block break-all text-[1.02rem] font-semibold leading-snug sm:break-words">
              {EMAIL_INTAKE}
            </span>
          </span>
        </a>
        <a
          href={FAX_TEL}
          className="group flex items-center gap-3 text-amber-50/90 transition hover:text-white"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC72C]/15 text-[#FFC72C] ring-1 ring-[#FFC72C]/25 transition group-hover:bg-[#FFC72C]/25">
            <Printer className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-200/85">
              Fax
            </span>
            <span className="block text-[1.08rem] font-semibold leading-snug">{FAX_DISPLAY}</span>
          </span>
        </a>
      </div>
    </section>
  );
}
