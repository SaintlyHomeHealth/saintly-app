import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bath,
  CheckCircle2,
  ClipboardList,
  Footprints,
  Heart,
  HeartPulse,
  MessageCircle,
  Phone,
  Pill,
  Sparkles,
  Stethoscope,
  Syringe,
  Users2,
} from "lucide-react";
import { HaloMark } from "./MarketingHaloMark";
import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import { PHONE_DISPLAY, TEL } from "./marketing-constants";
import {
  BG_CREAM_COOL,
  BG_CREAM_GOLD,
  BG_CREAM_SOFT,
  BTN_DARK_OUTLINE,
  BTN_GOLD,
  CREAM,
  GoldIconTile,
  NAVY,
  SectionEyebrow,
  TrustPill,
} from "./marketing-design";
import { MARKETING_NAV_SERVICES_PAGE } from "./marketing-nav";

const TRUST_PILLS = [
  "Medicare-Certified",
  "Physician-Ordered",
  "Skilled Care at Home",
  "Greater Phoenix",
] as const;

type ServiceFeature = {
  href?: string;
  tag: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const FEATURED_SERVICES: ServiceFeature[] = [
  {
    href: "/services/skilled-nursing",
    tag: "Skilled Nursing",
    title: "Skilled nursing at home",
    body: "Assessments, medication support, condition monitoring, and physician-coordinated care from licensed RNs and LVNs.",
    icon: Stethoscope,
  },
  {
    href: "/services/wound-care",
    tag: "Wound Care",
    title: "Advanced wound care",
    body: "Dressing changes, infection monitoring, and teaching for chronic, surgical, and diabetic wounds.",
    icon: HeartPulse,
  },
  {
    href: "/services/physical-therapy",
    tag: "Physical Therapy",
    title: "Physical therapy",
    body: "Strength, balance, gait, and mobility after surgery or illness — without trips to a clinic.",
    icon: Footprints,
  },
  {
    href: "/services/home-health-aide",
    tag: "Home Health Aide",
    title: "Home health aide support",
    body: "Compassionate help with bathing, dressing, meals, and daily routines under professional direction.",
    icon: Heart,
  },
];

type AdditionalService = {
  tag: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const ADDITIONAL_SERVICES: AdditionalService[] = [
  {
    tag: "Therapy",
    title: "Occupational Therapy",
    body: "Daily living skills — dressing, bathing, cooking — so patients stay as independent as possible at home.",
    icon: Bath,
  },
  {
    tag: "Therapy",
    title: "Speech Therapy",
    body: "Speech, language, cognition, and swallowing support after stroke, illness, or injury.",
    icon: MessageCircle,
  },
  {
    tag: "Meds",
    title: "Medication management",
    body: "Reviews and teaching so doses, times, and side effects stay clear for patients and physicians.",
    icon: Pill,
  },
  {
    tag: "Care",
    title: "Catheter & ostomy care",
    body: "Maintenance, skin checks, and confidence-building support for comfort and infection prevention.",
    icon: Syringe,
  },
  {
    tag: "Support",
    title: "Medical social work",
    body: "Resources, planning, and emotional support for families navigating complex care.",
    icon: ClipboardList,
  },
  {
    tag: "Care",
    title: "Personal care support",
    body: "Aide visits under RN direction — safety, comfort, and dignity at every step.",
    icon: Users2,
  },
];

const WHO_WE_HELP = [
  "Recent hospital discharge",
  "Wound not healing",
  "Trouble with mobility",
  "Fall risk",
  "Need therapy at home",
  "Need nursing oversight at home",
] as const;

const COVERAGE_BULLETS = [
  "Physician order required",
  "Home health eligibility applies",
  "Skilled nursing or therapy need",
  "Coverage depends on Medicare criteria",
  "Supplemental insurance may help with costs",
] as const;

export function MarketingServicesPage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_SERVICES_PAGE} />

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="services-hero-heading"
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
              <SectionEyebrow>Home Health Services · Saintly Home Health</SectionEyebrow>
            </div>

            <h1
              id="services-hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)]"
              style={{ color: NAVY }}
            >
              Home health services we provide
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              Skilled nursing, wound care, therapy, and aide support delivered at home —
              ordered by your physician, delivered by our Tempe-based team.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:mt-12 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
              <a href={TEL} className={BTN_GOLD}>
                <span
                  className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-0 rounded-full bg-[#FFC72C]/25 blur-[28px]"
                  aria-hidden
                />
                <Phone className="relative h-[1.4rem] w-[1.4rem]" strokeWidth={2.25} aria-hidden />
                <span className="relative">Call {PHONE_DISPLAY}</span>
              </a>
              <a href="/medicare" className={BTN_DARK_OUTLINE}>
                Check Medicare coverage
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
                src="/marketing/services-wound-care.jpg"
                alt="Saintly clinician providing skilled wound care at home with branded supply bag"
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

      {/* ─── Featured services (4 cards → dedicated pages) ──────────────── */}
      <section
        id="featured"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="featured-title"
        style={{ backgroundColor: CREAM }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Our four core services</SectionEyebrow>
          <h2
            id="featured-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            What we do most often
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Every plan is individualized. These are the four core services families ask for first.
          </p>
        </div>

        <ul className="relative mx-auto mt-16 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:gap-8">
          {FEATURED_SERVICES.map(({ href, tag, title, body, icon: Icon }) => {
            const Inner = (
              <article className="relative flex h-full flex-col gap-6 overflow-hidden rounded-[1.85rem] border border-amber-100/80 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                <span
                  className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFC72C]/20 blur-2xl"
                  aria-hidden
                />
                <div className="flex items-center gap-4">
                  <GoldIconTile size="md">
                    <Icon className="h-7 w-7" strokeWidth={1.9} />
                  </GoldIconTile>
                  <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    {tag}
                  </span>
                </div>
                <div>
                  <h3
                    className="text-[1.32rem] font-semibold leading-[1.25] tracking-[-0.01em] sm:text-[1.4rem]"
                    style={{ color: NAVY }}
                  >
                    {title}
                  </h3>
                  <p className="mt-3.5 text-[1.05rem] leading-[1.62] text-slate-700">{body}</p>
                </div>
                {href ? (
                  <span className="mt-auto inline-flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Learn more
                    <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </span>
                ) : null}
              </article>
            );
            return (
              <li key={title} className="group h-full">
                {href ? (
                  <Link
                    href={href}
                    className="block h-full rounded-[1.85rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf0]"
                  >
                    {Inner}
                  </Link>
                ) : (
                  Inner
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ─── Therapy split feature ──────────────────────────────────────── */}
      <section
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 pb-[clamp(5.75rem,13vw,8.75rem)] pt-[clamp(2rem,6vw,3.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="services-therapy-heading"
      >
        <div
          className="relative mx-auto max-w-[84rem] overflow-hidden rounded-[2.25rem] border border-amber-100/80 shadow-[0_54px_120px_-44px_rgba(15,23,42,0.30)] md:rounded-[2.5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#FFC72C]/[0.20] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 items-stretch gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            <div className="relative flex min-w-0 flex-col justify-center gap-6 px-7 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div>
                <HaloMark className="mb-4 block" width={92} height={28} />
                <SectionEyebrow>Therapy at home</SectionEyebrow>
                <h2
                  id="services-therapy-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Physical, occupational, and speech therapy where you live
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Visits focused on strength, safety, and independence — without traveling to a
                  clinic. Therapists adapt the work to your real environment.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                <Link href="/services/physical-therapy" className={BTN_GOLD}>
                  <span
                    className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-0 rounded-full bg-[#FFC72C]/25 blur-[28px]"
                    aria-hidden
                  />
                  <span className="relative">See Physical Therapy</span>
                </Link>
                <Link href="/services/skilled-nursing" className={BTN_DARK_OUTLINE}>
                  See Skilled Nursing
                  <span className="text-lg leading-none text-[#0c1929]" aria-hidden>
                    →
                  </span>
                </Link>
              </div>
            </div>

            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[440px] lg:rounded-r-[2.5rem]">
              <Image
                src="/marketing/services-therapy.jpg"
                alt="Saintly physical therapist helping a patient practice walking safely at home"
                fill
                sizes="(max-width: 1024px) 100vw, 46vw"
                quality={92}
                className="object-cover object-center"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-tl from-[#FFC72C]/15 via-transparent to-transparent"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Additional services ────────────────────────────────────────── */}
      <section
        id="additional"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="additional-title"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Additional services</SectionEyebrow>
          <h2
            id="additional-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            More ways we support you at home
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Available when ordered as part of your plan of care.
          </p>
        </div>

        <ul className="relative mx-auto mt-16 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {ADDITIONAL_SERVICES.map(({ tag, title, body, icon: Icon }) => (
            <li key={title} className="group h-full">
              <article className="relative flex h-full flex-col gap-6 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                <span
                  className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFC72C]/20 blur-2xl"
                  aria-hidden
                />
                <div className="flex items-center gap-4">
                  <GoldIconTile size="md">
                    <Icon className="h-7 w-7" strokeWidth={1.9} />
                  </GoldIconTile>
                  <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    {tag}
                  </span>
                </div>
                <div>
                  <h3
                    className="text-[1.22rem] font-semibold leading-[1.25] tracking-[-0.01em] sm:text-[1.3rem]"
                    style={{ color: NAVY }}
                  >
                    {title}
                  </h3>
                  <p className="mt-3.5 text-[1.05rem] leading-[1.62] text-slate-700">{body}</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Who we help ───────────────────────────────────────────────── */}
      <section
        id="who-we-help"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="who-title"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Who we help</SectionEyebrow>
          <h2
            id="who-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Common reasons families call us
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Not sure if you qualify? Call — we&apos;ll ask a few questions and guide you.
          </p>
        </div>

        <ul className="relative mx-auto mt-12 grid min-w-0 max-w-[80rem] gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {WHO_WE_HELP.map((line) => (
            <li key={line}>
              <span className="flex items-start gap-4 rounded-2xl border border-white/95 bg-white/95 px-5 py-4 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 sm:px-6 sm:py-5">
                <GoldIconTile size="sm">
                  <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                </GoldIconTile>
                <span className="pt-1 text-[1.08rem] font-semibold leading-[1.5] text-[#0c1929] sm:text-[1.16rem]">
                  {line}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Medicare panel ─────────────────────────────────────────────── */}
      <section
        id="medicare"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="medicare-title"
      >
        <div
          className="relative mx-auto max-w-[85rem] overflow-hidden rounded-[2.25rem] border border-amber-100/90 px-9 py-16 shadow-[0_54px_120px_-42px_rgba(15,23,42,0.34)] sm:px-14 sm:py-[4.5rem] md:px-[4.25rem] md:py-[5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-28 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[#FFC72C]/[0.22] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-16">
            <div className="min-w-0">
              <HaloMark className="mb-4 block" width={92} height={28} />
              <SectionEyebrow>Medicare &amp; eligibility</SectionEyebrow>
              <h2
                id="medicare-title"
                className="mt-5 text-balance text-[clamp(1.95rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.1rem,3.5vw,3.35rem)] lg:text-[clamp(2.25rem,3.2vw,3.65rem)]"
                style={{ color: NAVY }}
              >
                How home health coverage works
              </h2>
              <p className="mt-7 text-[1.22rem] leading-[1.7] text-slate-800 sm:text-[1.32rem] sm:leading-[1.72]">
                Medicare may cover home health services when care is medically necessary,
                ordered by a physician, and home health eligibility requirements are met. Our
                intake team reviews your situation and explains next steps in plain language.
              </p>
              <div className="mt-8 inline-flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-white/90 px-5 py-4 text-[1.02rem] leading-[1.55] text-slate-700 shadow-[0_18px_40px_-22px_rgba(245,180,0,0.45)] ring-1 ring-amber-100/70 backdrop-blur-sm sm:text-[1.08rem]">
                <Sparkles
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>
                  Many Original Medicare patients with a Medicare Supplement may have{" "}
                  <strong className="font-semibold text-[#0c1929]">$0 out-of-pocket cost</strong>{" "}
                  when care is medically necessary and covered.
                </span>
              </div>
              <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
                <Link href="/medicare" className={BTN_DARK_OUTLINE}>
                  Learn more about Medicare
                  <span className="text-lg leading-none text-[#0c1929]" aria-hidden>
                    →
                  </span>
                </Link>
              </div>
            </div>

            <ul className="relative min-w-0 space-y-3.5 sm:space-y-4">
              {COVERAGE_BULLETS.map((bullet) => (
                <li key={bullet}>
                  <span className="flex items-start gap-4 rounded-2xl border border-white/95 bg-white/95 px-6 py-5 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40">
                    <GoldIconTile size="sm">
                      <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                    </GoldIconTile>
                    <span className="pt-1 text-[1.1rem] font-semibold leading-[1.5] text-[#0c1929] sm:text-[1.18rem]">
                      {bullet}
                    </span>
                  </span>
                </li>
              ))}
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
