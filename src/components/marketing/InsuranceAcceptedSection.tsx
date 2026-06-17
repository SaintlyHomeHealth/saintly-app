import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import {
  INSURANCE_ACCEPTED_DISCLAIMER,
  INSURANCE_ACCEPTED_HEADING,
  INSURANCE_ACCEPTED_SUBHEADING,
  INSURANCE_PLANS,
  type InsurancePlan,
} from "@/lib/marketing/insurance-accepted-payers";
import { PHONE_DISPLAY, TEL } from "./marketing-constants";
import {
  BG_CREAM_COOL,
  BTN_DARK_OUTLINE,
  BTN_GOLD_SM,
  CREAM,
  NAVY,
  SectionEyebrow,
} from "./marketing-design";
import { HaloMark } from "./MarketingHaloMark";
import { InsurancePayerLogo } from "./InsurancePayerLogo";

type InsuranceAcceptedSectionProps = {
  id?: string;
  /** When true, section uses full-bleed cream background (standalone page). */
  standalone?: boolean;
  /** Show section heading and intro (disable when the page hero already covers it). */
  showHeader?: boolean;
  /** Show "View all plans" link to the dedicated page (homepage teaser). */
  showViewAllLink?: boolean;
};

function PlanLogoCard({ plan }: { plan: InsurancePlan }) {
  return (
    <li className="h-full">
      <article className="group flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_18px_44px_-26px_rgba(15,23,42,0.22)] ring-1 ring-slate-100/60 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_30px_70px_-26px_rgba(245,180,0,0.32)] sm:p-6">
        <div className="relative flex h-[5rem] w-full items-center justify-center sm:h-[5.5rem]">
          <InsurancePayerLogo name={plan.name} logo={plan.logo} initials={plan.initials} />
        </div>
        <p className="mt-4 text-center text-[0.82rem] font-semibold leading-snug tracking-tight text-slate-500">
          {plan.name}
        </p>
        {plan.note ? (
          <p className="mt-1.5 text-center text-[0.68rem] font-medium leading-snug text-amber-700">
            {plan.note}
          </p>
        ) : null}
      </article>
    </li>
  );
}

/** Reusable insurance / plan logo grid for homepage and dedicated insurance page. */
export function InsuranceAcceptedSection({
  id = "insurance-accepted",
  standalone = false,
  showHeader = true,
  showViewAllLink = false,
}: InsuranceAcceptedSectionProps) {
  return (
    <section
      id={id}
      className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
      aria-labelledby={`${id}-heading`}
      style={{ background: standalone ? CREAM : BG_CREAM_COOL }}
    >
      <div
        className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-sky-200/35 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-[#FFC72C]/14 blur-[110px]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-[84rem]">
        {showHeader ? (
          <div className="mx-auto max-w-3xl text-center">
            <HaloMark className="mx-auto mb-3 block" width={88} height={28} />
            <SectionEyebrow>Insurance &amp; plans</SectionEyebrow>
            <h2
              id={`${id}-heading`}
              className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[clamp(2.25rem,4vw,3.75rem)]"
              style={{ color: NAVY }}
            >
              {INSURANCE_ACCEPTED_HEADING}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-[1.12rem] leading-[1.65] text-slate-600 sm:text-[1.22rem]">
              {INSURANCE_ACCEPTED_SUBHEADING}
            </p>
          </div>
        ) : (
          <h2 id={`${id}-heading`} className="sr-only">
            {INSURANCE_ACCEPTED_HEADING}
          </h2>
        )}

        <ul
          className={`relative mx-auto grid min-w-0 grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5 ${
            showHeader ? "mt-14" : "mt-0"
          }`}
        >
          {INSURANCE_PLANS.map((plan) => (
            <PlanLogoCard key={plan.name} plan={plan} />
          ))}
        </ul>

        <div
          className="mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200/80 bg-white/85 px-6 py-5 text-center shadow-[0_12px_32px_-20px_rgba(15,23,42,0.18)] ring-1 ring-slate-100/80 sm:px-8 sm:py-6"
          role="note"
        >
          <p className="text-[0.92rem] leading-[1.68] text-slate-600 sm:text-[0.98rem]">
            {INSURANCE_ACCEPTED_DISCLAIMER}
          </p>
        </div>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-5">
          <Link href="/contact#form" className={`${BTN_GOLD_SM} w-full sm:w-auto sm:min-w-[240px]`}>
            Verify My Insurance
            <ArrowRight
              className="h-5 w-5 transition group-hover:translate-x-0.5"
              strokeWidth={2.25}
              aria-hidden
            />
          </Link>
          <a
            href={TEL}
            className={`${BTN_DARK_OUTLINE} min-h-[60px] min-w-0 w-full px-8 py-3.5 text-[16px] sm:w-auto sm:min-w-[240px] md:text-[17px]`}
          >
            <Phone className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            Call Saintly
          </a>
        </div>

        <p className="mt-5 text-center text-[0.92rem] font-medium text-slate-500">
          Prefer to talk now? Call{" "}
          <a href={TEL} className="font-semibold text-[#0c1929] underline-offset-4 hover:underline">
            {PHONE_DISPLAY}
          </a>
          .
        </p>

        {showViewAllLink ? (
          <p className="mt-8 text-center">
            <Link
              href="/insurance"
              className="inline-flex items-center gap-2 text-[1rem] font-semibold text-[#0c1929] underline-offset-4 transition hover:text-amber-800 hover:underline"
            >
              View full insurance details
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
