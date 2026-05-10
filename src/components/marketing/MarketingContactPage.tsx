import Image from "next/image";
import {
  Building2,
  CheckCircle2,
  HeartPulse,
  Map,
  Mail,
  Phone,
  Printer,
  Stethoscope,
} from "lucide-react";
import { HaloMark } from "./MarketingHaloMark";
import { MarketingContactForm } from "./MarketingContactForm";
import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import {
  ADDRESS_LINE_CITY,
  ADDRESS_LINE_STREET,
  EMAIL_INTAKE,
  FAX_DISPLAY,
  MAILTO_INTAKE,
  PHONE_DISPLAY,
  TEL,
} from "./marketing-constants";
import {
  BG_CREAM_COOL,
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
import { MARKETING_NAV_CONTACT_PAGE } from "./marketing-nav";
import "./marketing-home.css";

const TRUST_PILLS = [
  "Same-day callback",
  "Greater Phoenix",
  "Tempe-Based",
  "Medicare-Certified",
] as const;

const HOW_WE_HELP = [
  {
    title: "Questions about home health",
    body: "What we do, how visits work, and what to expect from our team.",
    icon: Stethoscope,
  },
  {
    title: "Medicare eligibility help",
    body: "Plain-language guidance on coverage and what your doctor needs to order.",
    icon: CheckCircle2,
  },
  {
    title: "Wound care at home",
    body: "Dressing changes, monitoring, and teaching for complex or slow-healing wounds.",
    icon: HeartPulse,
  },
  {
    title: "Skilled nursing at home",
    body: "Assessments, injections, vitals, and medication support with physician follow-up.",
    icon: Stethoscope,
  },
  {
    title: "Therapy at home",
    body: "PT, OT, and ST focused on your goals — without traveling to a clinic.",
    icon: HeartPulse,
  },
  {
    title: "Help after hospital discharge",
    body: "Coordination with your care team so the next steps at home feel clear.",
    icon: CheckCircle2,
  },
] as const;

const QUICK_CARDS = [
  {
    label: "Phone",
    value: PHONE_DISPLAY,
    href: TEL,
    meta: "Call or text — same line",
    icon: Phone,
  },
  {
    label: "Fax",
    value: FAX_DISPLAY,
    href: FAX_TEL,
    meta: "Referrals & documents",
    icon: Printer,
  },
  {
    label: "Email",
    value: EMAIL_INTAKE,
    href: MAILTO_INTAKE,
    meta: "Intake & general questions",
    icon: Mail,
  },
] as const;

export function MarketingContactPage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_CONTACT_PAGE} />

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="contact-hero-heading"
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

        <div className="relative mx-auto grid w-full min-w-0 max-w-[88rem] gap-14 px-5 pb-24 pt-12 sm:gap-16 sm:px-7 sm:pb-28 sm:pt-16 md:gap-20 md:pb-32 md:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-x-20 lg:px-10 lg:pb-36 lg:pt-24 xl:gap-x-24 xl:pb-40 xl:pt-28">
          <div className="min-w-0 max-w-[40rem]">
            <div className="mb-9">
              <HaloMark className="mb-3 block" width={92} height={28} />
              <SectionEyebrow>Intake &amp; Referrals · Tempe, AZ</SectionEyebrow>
            </div>

            <h1
              id="contact-hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)]"
              style={{ color: NAVY }}
            >
              Talk to our intake team
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              We&apos;ll review your situation, explain next steps, and help coordinate with
              your doctor — no pressure, just clear answers.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:mt-12 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
              <a href={TEL} className={BTN_GOLD}>
                <span
                  className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-0 rounded-full bg-[#FFC72C]/25 blur-[28px]"
                  aria-hidden
                />
                <Phone className="relative h-[1.4rem] w-[1.4rem]" strokeWidth={2.25} aria-hidden />
                <span className="relative">Call or Text {PHONE_DISPLAY}</span>
              </a>
              <a href="#form" className={BTN_DARK_OUTLINE}>
                Send a message
                <span className="text-lg leading-none text-[#0c1929]" aria-hidden>
                  →
                </span>
              </a>
            </div>

            <ul className="mt-9 flex flex-wrap gap-2.5 sm:mt-10 sm:gap-3">
              {TRUST_PILLS.map((pill) => (
                <li key={pill}>
                  <TrustPill label={pill} />
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto min-w-0 w-full max-w-2xl lg:mx-0 lg:max-w-none">
            <div
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.85rem] bg-gradient-to-br from-[#FFC72C]/45 via-[#FFC72C]/15 to-transparent opacity-95 blur-[44px] sm:-inset-8 sm:rounded-[3rem]"
              aria-hidden
            />
            <div className="relative aspect-[4/3] min-h-[300px] overflow-hidden rounded-[2rem] bg-slate-100 shadow-[0_50px_100px_-30px_rgba(15,23,42,0.32),0_0_80px_-20px_rgba(245,180,0,0.22)] ring-1 ring-white/85 sm:aspect-[5/4] sm:min-h-[400px] lg:aspect-[4/5] lg:min-h-[560px] lg:rounded-[2.5rem] xl:min-h-[640px]">
              <Image
                src="/marketing/home_healthcare_consultation_in_cozy_setting.png"
                alt="Saintly intake nurse listening with care during a home consultation"
                fill
                sizes="(max-width: 1024px) min(100vw, 720px), min(640px, 46vw)"
                quality={92}
                className="object-cover object-center"
                priority
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/12 via-transparent to-white/10"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/45"
                aria-hidden
              />
            </div>
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

      {/* ─── Quick contact cards ───────────────────────────────────────── */}
      <section
        id="quick-contact"
        className="relative overflow-x-hidden px-5 py-[clamp(5rem,12vw,8rem)] sm:px-7 lg:px-10"
        aria-labelledby="quick-title"
        style={{ backgroundColor: CREAM }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Reach us</SectionEyebrow>
          <h2
            id="quick-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Quick contact
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Save this page — everything you need to reach intake or send a referral.
          </p>
        </div>

        <ul className="relative mx-auto mt-12 grid min-w-0 max-w-[80rem] gap-6 sm:grid-cols-3 sm:gap-7">
          {QUICK_CARDS.map(({ label, value, href, meta, icon: Icon }) => (
            <li key={label} className="group h-full">
              <a
                href={href}
                className="relative flex h-full flex-col gap-4 overflow-hidden rounded-[1.85rem] border border-amber-100/80 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9"
              >
                <span
                  className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFC72C]/20 blur-2xl"
                  aria-hidden
                />
                <GoldIconTile size="md">
                  <Icon className="h-7 w-7" strokeWidth={1.9} />
                </GoldIconTile>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    {label}
                  </p>
                  <p
                    className="mt-2 break-words text-[1.32rem] font-semibold leading-snug sm:text-[1.4rem]"
                    style={{ color: NAVY }}
                  >
                    {value}
                  </p>
                  <p className="mt-2 text-[1rem] leading-[1.5] text-slate-600">{meta}</p>
                </div>
              </a>
            </li>
          ))}
        </ul>

        <div className="relative mx-auto mt-8 grid min-w-0 max-w-[80rem] gap-6 sm:grid-cols-2 sm:gap-7">
          <article className="relative flex h-full flex-col gap-4 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 sm:p-9">
            <GoldIconTile size="md">
              <Building2 className="h-7 w-7" strokeWidth={1.9} />
            </GoldIconTile>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                Office address
              </p>
              <p
                className="mt-2 text-[1.12rem] font-semibold leading-[1.5] sm:text-[1.18rem]"
                style={{ color: NAVY }}
              >
                {ADDRESS_LINE_STREET}
                <br />
                {ADDRESS_LINE_CITY}
              </p>
            </div>
          </article>
          <article className="relative flex h-full flex-col gap-4 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 sm:p-9">
            <GoldIconTile size="md">
              <Map className="h-7 w-7" strokeWidth={1.9} />
            </GoldIconTile>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                Service area
              </p>
              <p
                className="mt-2 text-[1.12rem] font-semibold leading-[1.5] sm:text-[1.18rem]"
                style={{ color: NAVY }}
              >
                Greater Phoenix &amp; surrounding communities
              </p>
              <p className="mt-2 text-[1rem] leading-[1.55] text-slate-600">
                Maricopa, Pinal, Gila, Yavapai, Pima &amp; nearby counties.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* ─── How we help ───────────────────────────────────────────────── */}
      <section
        id="how-we-help"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="help-title"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>How we can help</SectionEyebrow>
          <h2
            id="help-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Common reasons people call
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Tell us what you&apos;re dealing with — we&apos;ll match you with the right next step.
          </p>
        </div>

        <ul className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {HOW_WE_HELP.map(({ title, body, icon: Icon }) => (
            <li key={title} className="group h-full">
              <article className="relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                <GoldIconTile size="sm">
                  <Icon className="h-5 w-5" strokeWidth={2.25} />
                </GoldIconTile>
                <h3
                  className="text-[1.22rem] font-semibold leading-[1.25] tracking-[-0.01em] sm:text-[1.3rem]"
                  style={{ color: NAVY }}
                >
                  {title}
                </h3>
                <p className="text-[1.05rem] leading-[1.62] text-slate-700">{body}</p>
              </article>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Referrals callout ──────────────────────────────────────── */}
      <section
        id="referrals"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="referral-title"
        style={{ backgroundColor: CREAM }}
      >
        <div
          className="relative mx-auto max-w-[85rem] overflow-hidden rounded-[2.25rem] border border-amber-100/90 px-9 py-14 shadow-[0_54px_120px_-42px_rgba(15,23,42,0.34)] sm:px-14 sm:py-[4.5rem] md:px-[4.25rem] md:py-[5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-28 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[#FFC72C]/[0.22] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16">
            <div className="min-w-0">
              <HaloMark className="mb-4 block" width={92} height={28} />
              <SectionEyebrow>For professionals</SectionEyebrow>
              <h2
                id="referral-title"
                className="mt-5 text-balance text-[clamp(1.95rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.1rem,3.5vw,3.35rem)]"
                style={{ color: NAVY }}
              >
                Referrals &amp; care coordination
              </h2>
              <p className="mt-6 text-[1.22rem] leading-[1.7] text-slate-800 sm:text-[1.32rem] sm:leading-[1.72]">
                Physicians, case managers, discharge planners, and referral partners — we welcome
                your patients and confirm receipt quickly.
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
                <a href="/referrals" className={BTN_DARK_OUTLINE}>
                  Referrals page
                  <span className="text-lg leading-none text-[#0c1929]" aria-hidden>
                    →
                  </span>
                </a>
              </div>
            </div>

            <ul className="relative min-w-0 space-y-3.5 sm:space-y-4">
              {QUICK_CARDS.map(({ label, value, href, meta, icon: Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    className="flex items-start gap-4 rounded-2xl border border-white/95 bg-white/95 px-6 py-5 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition hover:border-amber-200/80 hover:shadow-[0_28px_60px_-22px_rgba(245,180,0,0.32)]"
                  >
                    <GoldIconTile size="sm">
                      <Icon className="h-5 w-5" strokeWidth={2.25} />
                    </GoldIconTile>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        {label}
                      </span>
                      <span
                        className="mt-1 block break-words text-[1.16rem] font-semibold leading-snug sm:text-[1.22rem]"
                        style={{ color: NAVY }}
                      >
                        {value}
                      </span>
                      <span className="mt-1 block text-[14px] leading-[1.5] text-slate-600">
                        {meta}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Intake form (preserve component + behavior) ─────────────── */}
      <section
        id="form"
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="form-title"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-3xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Send a message</SectionEyebrow>
          <h2
            id="form-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Intake form
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Share a few details — we&apos;ll respond by phone or email. Prefer to talk now? Call{" "}
            <a
              href={TEL}
              className="font-semibold text-amber-700 underline-offset-2 hover:underline"
            >
              {PHONE_DISPLAY}
            </a>
            .
          </p>
        </div>

        <div className="relative mx-auto mt-12 max-w-3xl rounded-[2rem] border border-amber-100/80 bg-white/95 p-6 shadow-[0_38px_90px_-32px_rgba(15,23,42,0.28)] ring-1 ring-amber-100/40 sm:p-10">
          <MarketingContactForm />
        </div>
      </section>

      <MarketingFinalCtaStrip />

      <MarketingSiteFooter />

      <MarketingStickyMobileCta />
    </div>
  );
}
