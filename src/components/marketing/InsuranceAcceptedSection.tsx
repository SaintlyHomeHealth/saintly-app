import Link from "next/link";
import { ArrowRight, CalendarClock, Network, Phone, ShieldCheck } from "lucide-react";
import {
  INSURANCE_ACCEPTED_DISCLAIMER,
  INSURANCE_ACCEPTED_INTRO,
  INSURANCE_ACCEPTED_PAYERS,
  INSURANCE_NETWORK_PARTNERS,
  type InsurancePayer,
  type InsurancePayerStatusKind,
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

const STATUS_BADGE: Record<
  InsurancePayerStatusKind,
  { className: string; icon?: "shield" | "calendar" }
> = {
  accepted: {
    className:
      "border-emerald-200/90 bg-emerald-50/95 text-emerald-900 ring-emerald-100/80",
    icon: "shield",
  },
  "accepted-with-verification": {
    className: "border-sky-200/90 bg-sky-50/95 text-sky-950 ring-sky-100/80",
  },
  "accepted-through-tango": {
    className: "border-indigo-200/90 bg-indigo-50/95 text-indigo-950 ring-indigo-100/80",
  },
  "accepted-with-authorization": {
    className: "border-amber-200/90 bg-amber-50/95 text-amber-950 ring-amber-100/80",
  },
  "starts-on-date": {
    className:
      "border-[#FFC72C]/90 bg-[#FFC72C]/20 text-[#0c1929] ring-amber-200/90 font-bold",
    icon: "calendar",
  },
  "network-partner": {
    className: "border-violet-200/90 bg-violet-50/95 text-violet-950 ring-violet-100/80",
  },
};

type InsuranceAcceptedSectionProps = {
  id?: string;
  /** When true, section uses full-bleed cream background (standalone page). */
  standalone?: boolean;
  /** Show section heading and intro (disable when the page hero already covers it). */
  showHeader?: boolean;
  /** Show "View all plans" link to the dedicated page (homepage teaser). */
  showViewAllLink?: boolean;
};

function StatusBadge({ payer }: { payer: InsurancePayer }) {
  const style = STATUS_BADGE[payer.statusKind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold leading-snug ring-1 sm:text-[12px] ${style.className}`}
    >
      {style.icon === "shield" ? (
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
      ) : null}
      {style.icon === "calendar" ? (
        <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
      ) : null}
      {payer.statusLabel}
    </span>
  );
}

function PayerCard({ payer }: { payer: InsurancePayer }) {
  const isUpcoming = payer.statusKind === "starts-on-date";
  const isPartner = payer.isNetworkPartner;

  return (
    <li className="h-full">
      <article
        className={`relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.65rem] border bg-white/95 p-6 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.20)] ring-1 transition duration-300 hover:-translate-y-0.5 sm:p-7 ${
          isUpcoming
            ? "border-[#FFC72C]/80 ring-amber-300/70 hover:border-[#FFC72C] hover:shadow-[0_32px_72px_-24px_rgba(245,180,0,0.40)]"
            : isPartner
              ? "border-violet-300/80 ring-violet-200/60 hover:border-violet-400/80"
              : "border-amber-100/70 ring-amber-100/40 hover:border-amber-200/80 hover:shadow-[0_32px_72px_-24px_rgba(245,180,0,0.28)]"
        }`}
      >
        {payer.startsDateLabel ? (
          <div
            className="absolute right-0 top-0 rounded-bl-2xl rounded-tr-[1.65rem] bg-[#FFC72C] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#0c1929] shadow-[0_8px_20px_-8px_rgba(245,180,0,0.65)] sm:text-[12px]"
          >
            {payer.startsDateLabel}
          </div>
        ) : null}

        <div className={`flex min-h-[4.5rem] items-center ${payer.startsDateLabel ? "pr-28 sm:pr-32" : ""}`}>
          <InsurancePayerLogo
            logoFile={payer.logoFile}
            logoAlt={payer.logoAlt}
            logoInitials={payer.logoInitials}
            payerName={payer.name}
          />
        </div>

        <div className="flex flex-1 flex-col gap-3">
          {isPartner ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
              Not an insurance carrier
            </p>
          ) : null}
          <h3
            className="text-[1.12rem] font-semibold leading-snug tracking-[-0.01em] sm:text-[1.18rem]"
            style={{ color: NAVY }}
          >
            {payer.name}
          </h3>
          <StatusBadge payer={payer} />
          {payer.helperText ? (
            <p className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-[0.96rem] font-semibold leading-[1.55] text-amber-950 sm:text-[1rem]">
              {payer.helperText}
            </p>
          ) : null}
          <p className="mt-auto text-[0.98rem] leading-[1.62] text-slate-600 sm:text-[1.02rem]">
            {payer.note}
          </p>
        </div>
      </article>
    </li>
  );
}

/** Reusable insurance / payor grid for homepage and dedicated insurance page. */
export function InsuranceAcceptedSection({
  id = "insurance-accepted",
  standalone = false,
  showHeader = true,
  showViewAllLink = false,
}: InsuranceAcceptedSectionProps) {
  return (
    <section
      id={id}
      className={`relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10 ${
        standalone ? "" : ""
      }`}
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
              Insurance &amp; Plans We Accept
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-[1.12rem] leading-[1.65] text-slate-600 sm:text-[1.22rem]">
              {INSURANCE_ACCEPTED_INTRO}
            </p>
          </div>
        ) : (
          <h2 id={`${id}-heading`} className="sr-only">
            Insurance &amp; Plans We Accept
          </h2>
        )}

        <ul
          className={`relative mx-auto grid min-w-0 gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:gap-8 ${
            showHeader ? "mt-14" : "mt-0"
          }`}
        >
          {INSURANCE_ACCEPTED_PAYERS.map((payer) => (
            <PayerCard key={payer.id} payer={payer} />
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

        <div
          className="relative mx-auto mt-14 max-w-3xl rounded-[1.85rem] border border-dashed border-violet-300/80 bg-violet-50/40 px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-8 sm:py-10"
          aria-labelledby={`${id}-partner-heading`}
        >
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center sm:gap-4">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-800 ring-1 ring-violet-200/80">
              <Network className="h-5 w-5" strokeWidth={2.1} aria-hidden />
            </span>
            <div>
              <h3
                id={`${id}-partner-heading`}
                className="text-[13px] font-bold uppercase tracking-[0.2em] text-violet-900 sm:text-[14px]"
              >
                Network &amp; authorization partner
              </h3>
              <p className="mt-1 text-[0.92rem] leading-[1.55] text-violet-800/85 sm:text-[0.98rem]">
                Separate from insurance carriers — supports referral and authorization routing.
              </p>
            </div>
          </div>
          <ul className="mt-8 grid min-w-0 gap-6">
            {INSURANCE_NETWORK_PARTNERS.map((payer) => (
              <PayerCard key={payer.id} payer={payer} />
            ))}
          </ul>
          <p className="mx-auto mt-5 max-w-xl text-center text-[0.92rem] leading-[1.6] text-violet-900/70">
            Tango / PHCN is not an insurance company. Saintly accepts Tango-authorized referrals
            when applicable.
          </p>
        </div>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-5">
          <Link href="/contact#form" className={`${BTN_GOLD_SM} w-full sm:w-auto sm:min-w-[220px]`}>
            Verify Insurance
            <ArrowRight
              className="h-5 w-5 transition group-hover:translate-x-0.5"
              strokeWidth={2.25}
              aria-hidden
            />
          </Link>
          <a
            href={TEL}
            className={`${BTN_DARK_OUTLINE} min-h-[60px] min-w-0 w-full sm:w-auto sm:min-w-[280px] px-8 py-3.5 text-[16px] md:text-[17px]`}
          >
            <Phone className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            Call {PHONE_DISPLAY}
          </a>
        </div>

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
