import Image from "next/image";
import {
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Mail,
  Map,
  PhoneCall,
  Phone,
  Printer,
  ShieldCheck,
  Stethoscope,
  Users2,
} from "lucide-react";
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
import { MARKETING_NAV_REFERRALS_PAGE } from "./marketing-nav";

const MAILTO_REFERRAL = `${MAILTO_INTAKE}?subject=${encodeURIComponent("Referral — Saintly Home Health")}`;

const TRUST_PILLS = [
  "Medicare-Certified",
  "Fast Intake Response",
  "Greater Phoenix",
  "Tempe-Based",
] as const;

const PARTNER_TYPES = [
  "Physicians",
  "Hospitals",
  "Case Managers",
  "Discharge Planners",
  "Skilled Nursing Facilities",
  "Rehab Centers",
  "Community Referral Partners",
] as const;

const REFERRAL_SERVICES = [
  "Skilled Nursing",
  "Wound Care",
  "Physical Therapy",
  "Occupational Therapy",
  "Speech Therapy",
  "Medication Management",
  "Catheter Care",
  "Ostomy Care",
  "Medical Social Work",
  "Home Health Aide Support",
] as const;

const WHY_PARTNERS = [
  {
    title: "Medicare-certified agency",
    body: "Meets federal home health standards for quality, documentation, and patient rights.",
    icon: ShieldCheck,
  },
  {
    title: "Fast intake response",
    body: "We prioritize referral review and follow-up so transitions out of facilities stay smooth.",
    icon: CalendarCheck,
  },
  {
    title: "Coordinated physician communication",
    body: "Orders, updates, and changes flow back to the referring provider without delay.",
    icon: Stethoscope,
  },
  {
    title: "Experienced clinical leadership",
    body: "Nurse-led oversight and disciplined field practice you can rely on for complex patients.",
    icon: Users2,
  },
  {
    title: "Greater Phoenix coverage",
    body: "Tempe-based team serving Maricopa, Pinal, Gila, Yavapai, Pima, and surrounding areas.",
    icon: Map,
  },
  {
    title: "Compassionate, patient-centered care",
    body: "Clear plans, respectful visits, and families that know what to expect.",
    icon: CheckCircle2,
  },
] as const;

const REFERRAL_STEPS = [
  {
    n: 1,
    title: "Send referral",
    body: "Call, fax, or email clinical information and demographics — whichever fits your workflow.",
    icon: PhoneCall,
  },
  {
    n: 2,
    title: "We review eligibility & orders",
    body: "We confirm Medicare rules and work with the physician for compliant orders.",
    icon: Stethoscope,
  },
  {
    n: 3,
    title: "We coordinate intake & start of care",
    body: "Scheduling, first visit, and teaching — aligned with the plan of care.",
    icon: CalendarCheck,
  },
  {
    n: 4,
    title: "We keep the referring provider updated",
    body: "Progress, barriers, and discharge planning flow back to your team.",
    icon: ClipboardList,
  },
] as const;

const CONTACT_CARDS = [
  {
    label: "Call referrals",
    value: PHONE_DISPLAY,
    href: TEL,
    meta: "Fastest for urgent discharges",
    icon: Phone,
  },
  {
    label: "Fax referral",
    value: FAX_DISPLAY,
    href: FAX_TEL,
    meta: "Orders & clinical documents",
    icon: Printer,
  },
  {
    label: "Email referral",
    value: EMAIL_INTAKE,
    href: MAILTO_REFERRAL,
    meta: "Non-urgent referrals & questions",
    icon: Mail,
  },
] as const;

export function MarketingReferralsPage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_REFERRALS_PAGE} />

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="referrals-hero-heading"
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
              <SectionEyebrow>Partner Referrals · Greater Phoenix</SectionEyebrow>
            </div>

            <h1
              id="referrals-hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)]"
              style={{ color: NAVY }}
            >
              Refer patients to Saintly Home Health
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              We work with physicians, hospitals, case managers, discharge planners, and
              community partners to coordinate skilled home health quickly and professionally.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:mt-12 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
              <a href={TEL} className={BTN_GOLD}>
                <span
                  className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-0 rounded-full bg-[#FFC72C]/25 blur-[28px]"
                  aria-hidden
                />
                <Phone className="relative h-[1.4rem] w-[1.4rem]" strokeWidth={2.25} aria-hidden />
                <span className="relative">Call Intake {PHONE_DISPLAY}</span>
              </a>
              <a href="#referral-contact" className={BTN_DARK_OUTLINE}>
                Send a Referral
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
                src="/marketing/healthcare_team_in_modern_clinic_setting.png"
                alt="Saintly clinical team coordinating with referral partners in a modern clinical setting"
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

      {/* ─── Partners + clinical scope split ─────────────────────────────── */}
      <section
        id="partners"
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="partners-title"
        style={{ backgroundColor: CREAM }}
      >
        <div
          className="relative mx-auto max-w-[84rem] overflow-hidden rounded-[2.25rem] border border-amber-100/80 shadow-[0_54px_120px_-44px_rgba(15,23,42,0.30)] md:rounded-[2.5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#FFC72C]/[0.20] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 items-stretch gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[440px] lg:rounded-l-[2.5rem]">
              <Image
                src="/marketing/home_healthcare_consultation_in_cozy_setting.png"
                alt="Saintly intake nurse consulting with a patient and family at home"
                fill
                sizes="(max-width: 1024px) 100vw, 46vw"
                quality={92}
                className="object-cover object-center"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#FFC72C]/15 via-transparent to-transparent"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40"
                aria-hidden
              />
            </div>

            <div className="relative flex min-w-0 flex-col justify-center gap-7 px-7 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div>
                <HaloMark className="mb-4 block" width={92} height={28} />
                <SectionEyebrow>Partners</SectionEyebrow>
                <h2
                  id="partners-title"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Who we work with
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  If you help patients transition home — we want to be easy to reach.
                </p>
              </div>
              <ul className="flex flex-wrap gap-2.5 sm:gap-3" role="list">
                {PARTNER_TYPES.map((label) => (
                  <li key={label}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/95 px-4 py-2.5 text-[14px] font-semibold text-[#0c1929] shadow-[0_10px_26px_-14px_rgba(245,180,0,0.40)]">
                      <CheckCircle2 className="h-4 w-4 text-amber-600" strokeWidth={2.25} aria-hidden />
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Services we accept referrals for ───────────────────────────── */}
      <section
        id="services"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="ref-services-title"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Clinical scope</SectionEyebrow>
          <h2
            id="ref-services-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Services we accept referrals for
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Skilled care at home under physician orders — tell us what the patient needs.
          </p>
        </div>

        <ul className="relative mx-auto mt-12 grid min-w-0 max-w-[80rem] gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {REFERRAL_SERVICES.map((s) => (
            <li key={s}>
              <span className="flex items-start gap-3 rounded-2xl border border-amber-100/80 bg-white/95 px-5 py-4 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/30">
                <GoldIconTile size="sm">
                  <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                </GoldIconTile>
                <span className="pt-1.5 text-[1.05rem] font-semibold leading-[1.5] text-[#0c1929] sm:text-[1.1rem]">
                  {s}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Why partners choose Saintly ───────────────────────────────── */}
      <section
        id="why-saintly"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="why-partners-title"
        style={{ backgroundColor: CREAM }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Trust</SectionEyebrow>
          <h2
            id="why-partners-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Why referral partners choose Saintly
          </h2>
        </div>

        <ul className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {WHY_PARTNERS.map(({ title, body, icon: Icon }) => (
            <li key={title} className="group h-full">
              <article className="relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                <span
                  className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFC72C]/20 blur-2xl"
                  aria-hidden
                />
                <GoldIconTile size="md">
                  <Icon className="h-7 w-7" strokeWidth={1.9} />
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

      {/* ─── How referrals work ───────────────────────────────────────── */}
      <section
        id="how-referrals"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="how-title"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Process</SectionEyebrow>
          <h2
            id="how-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            How referrals work
          </h2>
        </div>

        <ol className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-4 lg:gap-8">
          {REFERRAL_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="relative flex flex-col">
                <div className="relative flex flex-1 flex-col rounded-[2rem] border border-amber-100/80 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                  <div className="flex items-center gap-4">
                    <span className="relative">
                      <GoldIconTile size="md">
                        <Icon className="h-7 w-7" strokeWidth={1.9} />
                      </GoldIconTile>
                      <span className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-200 bg-white text-[12px] font-bold text-amber-700 shadow-[0_4px_10px_-2px_rgba(15,23,42,0.18)]">
                        {step.n}
                      </span>
                    </span>
                  </div>
                  <h3
                    className="mt-5 text-[1.22rem] font-semibold leading-tight tracking-[-0.01em] sm:text-[1.3rem]"
                    style={{ color: NAVY }}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-3 flex-1 text-[1.05rem] leading-[1.6] text-slate-700">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ─── Referral desk contact panel ───────────────────────────────── */}
      <section
        id="referral-contact"
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="ref-contact-title"
        style={{ backgroundColor: CREAM }}
      >
        <div
          className="relative mx-auto max-w-[85rem] overflow-hidden rounded-[2.25rem] border border-amber-100/90 px-9 py-14 shadow-[0_54px_120px_-42px_rgba(15,23,42,0.34)] sm:px-14 sm:py-16 md:px-[4.25rem] md:py-[4.5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-28 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[#FFC72C]/[0.22] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
            <div className="min-w-0">
              <HaloMark className="mb-4 block" width={92} height={28} />
              <SectionEyebrow>Referral desk</SectionEyebrow>
              <h2
                id="ref-contact-title"
                className="mt-5 text-balance text-[clamp(1.95rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.1rem,3.5vw,3.35rem)]"
                style={{ color: NAVY }}
              >
                Send referrals here
              </h2>
              <p className="mt-6 text-[1.22rem] leading-[1.7] text-slate-800 sm:text-[1.32rem]">
                Use whichever channel fits your workflow — we monitor all lines during business
                hours.
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
                <a href={MAILTO_REFERRAL} className={BTN_DARK_OUTLINE}>
                  Email a Referral
                  <span className="text-lg leading-none text-[#0c1929]" aria-hidden>
                    →
                  </span>
                </a>
              </div>

              <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-white/90 px-5 py-4 text-[1.02rem] leading-[1.55] text-slate-700 shadow-[0_18px_40px_-22px_rgba(245,180,0,0.45)] ring-1 ring-amber-100/70 backdrop-blur-sm sm:text-[1.08rem]">
                <Building2
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>
                  <strong className="font-semibold text-[#0c1929]">Service area:</strong>{" "}
                  Greater Phoenix and surrounding counties — Tempe-based coverage across Maricopa,
                  Pinal, Gila, Yavapai, Pima, and nearby communities.
                </span>
              </div>
            </div>

            <ul className="relative min-w-0 space-y-3.5 sm:space-y-4">
              {CONTACT_CARDS.map(({ label, value, href, meta, icon: Icon }) => (
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

      <MarketingFinalCtaStrip variant="referrals" />

      <MarketingSiteFooter />

      <MarketingStickyMobileCta secondaryHref="#referral-contact" secondaryLabel="Send a Referral" />
    </div>
  );
}
