import Image from "next/image";
import {
  Activity,
  Bandage,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Droplet,
  Home,
  Mail,
  PhoneCall,
  Phone,
  Printer,
  Scissors,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  Waves,
} from "lucide-react";
import { HaloMark } from "./MarketingHaloMark";
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
  BG_DARK_GOLD,
  BTN_DARK_OUTLINE,
  BTN_GOLD,
  BTN_OUTLINE_ON_DARK,
  CREAM,
  FAX_TEL,
  GoldIconTile,
  NAVY,
  SectionEyebrow,
  TrustPill,
} from "./marketing-design";
import { MARKETING_NAV_WOUND_CARE_PAGE } from "./marketing-nav";

const IMG = {
  hero: "/marketing/caring_nurse_tends_to_patient_s_leg_wound.png",
  trust1: "/marketing/gentle_care_in_a_home_setting.png",
  trust2: "/marketing/caring_interaction_in_a_peaceful_home_setting.png",
  trust3: "/marketing/caring_support_in_a_peaceful_home.png",
  woundTypesSupporting: "/marketing/home_health_care_in_a_cozy_living_room.png",
  visit1: "/marketing/caregiving_guidance_in_a_cozy_setting.png",
  visit2: "/marketing/nurse_consulting_with_patient_in_cozy_home.png",
  lifestyle: "/marketing/relaxed_moment_by_the_window.png",
} as const;

const HERO_IMAGE_ALT =
  "Licensed Saintly nurse in navy scrubs tending to an older patient's bandaged lower leg during a peaceful home visit";

const TRUST_PILLS = [
  "Original Medicare Accepted",
  "Doctor-Ordered Care",
  "Skilled Nursing",
  "In-Home Wound Care",
] as const;

const WHY_CARDS = [
  {
    title: "Care at Home",
    body: "Healing where the patient is most comfortable — no clinic trips or waiting rooms.",
    icon: Home,
  },
  {
    title: "Skilled Nursing",
    body: "Licensed nurses assess wounds, change dressings, and monitor healing on physician orders.",
    icon: Stethoscope,
  },
  {
    title: "Doctor Coordination",
    body: "We stay in touch with the ordering provider so care stays aligned with the plan.",
    icon: Users,
  },
] as const;

const CONDITIONS = [
  {
    title: "Surgical wounds",
    body: "Post-operative incision care, monitoring, and education to support healing.",
    icon: Scissors,
  },
  {
    title: "Pressure injuries",
    body: "Skin integrity care for pressure ulcers and bed sores with prevention coaching.",
    icon: Activity,
  },
  {
    title: "Diabetic wounds",
    body: "Specialized care for diabetic foot wounds with infection-watch teaching.",
    icon: Droplet,
  },
  {
    title: "Venous ulcers",
    body: "Ongoing wound management for chronic venous and stasis ulcers of the legs.",
    icon: Waves,
  },
  {
    title: "Skin tears & complex wounds",
    body: "Gentle dressing technique and protective care for fragile or complex wounds.",
    icon: Bandage,
  },
  {
    title: "Wounds requiring dressing changes",
    body: "Scheduled dressing changes per physician orders to keep healing on track.",
    icon: ClipboardCheck,
  },
] as const;

const VISIT_INCLUDES = [
  "Dressing changes and wound observation",
  "Medication and infection warning sign education",
  "Updates to your doctor when needed",
  "Help understanding your care plan",
  "Support for family caregivers",
] as const;

const GENTLE_PHOTO_CARDS = [
  {
    eyebrow: "Skilled",
    title: "Organized, careful visits",
    body: "Your nurse arrives prepared with the right supplies, supports healing safely, and keeps each visit calm and predictable.",
    image: IMG.trust1,
    alt: "Saintly nurse preparing organized wound-care supplies at a patient's sunlit coffee table while the patient rests nearby",
  },
  {
    eyebrow: "Communication",
    title: "Clear answers, every step",
    body: "We explain wound progress, dressing changes, and warning signs in plain language so families always know what's next.",
    image: IMG.trust2,
    alt: "Nurse and older adult reviewing care together comfortably on a home sofa beside a sunny window",
  },
  {
    eyebrow: "Family",
    title: "Support for the whole household",
    body: "Caregivers get coaching and reassurance so wound care fits naturally into your home, not the other way around.",
    image: IMG.trust3,
    alt: "Nurse reviewing wound-care supplies attentively with a patient and family member seated together",
  },
] as const;

const COVERAGE_BULLETS = [
  "Physician order required",
  "Wound care must be medically necessary",
  "Patient must meet home health criteria",
  "Original Medicare accepted",
  "Medicare Supplement may help cover remaining costs",
] as const;

const REFERRAL_STEPS = [
  {
    title: "Call or Send Referral",
    body: "Send the referral or call our team. We verify basic information and explain the next steps.",
    icon: PhoneCall,
  },
  {
    title: "We Coordinate Orders",
    body: "We help obtain the physician orders, face-to-face note, and required documentation.",
    icon: Stethoscope,
  },
  {
    title: "Nurse Visits Begin at Home",
    body: "A licensed nurse begins skilled wound care visits, following the plan of care.",
    icon: CalendarCheck,
  },
] as const;

const FAQS = [
  {
    q: "Do I need a doctor’s order for wound care at home?",
    a: "Yes. Skilled home health wound care requires a physician/provider order and a face-to-face encounter that confirms the patient meets home health criteria.",
  },
  {
    q: "Does Medicare cover wound care at home?",
    a: "Medicare may cover wound care at home when skilled care is medically necessary and ordered by a physician, if the patient also meets home health eligibility requirements. Many Original Medicare patients with a Medicare Supplement may have $0 out-of-pocket cost when care is medically necessary and covered.",
  },
  {
    q: "Can Saintly help with dressing changes?",
    a: "Yes, when ordered by the provider and covered under the patient’s plan, our skilled nurses perform scheduled dressing changes and monitor healing.",
  },
  {
    q: "Do you accept AHCCCS?",
    a: "Yes, Saintly Home Health is an AHCCCS Medicaid provider in addition to being Medicare-certified.",
  },
] as const;

export function MarketingWoundCarePage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_WOUND_CARE_PAGE} />

      {/* ─── Hero — premium cream/gold panel, gold CTA ────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="wc-hero-heading"
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
        <div
          className="pointer-events-none absolute right-1/3 top-12 h-72 w-72 rounded-full bg-[#FFC72C]/[0.16] blur-[100px]"
          aria-hidden
        />

        <div className="relative mx-auto grid w-full min-w-0 max-w-[88rem] gap-14 px-5 pb-24 pt-12 sm:gap-16 sm:px-7 sm:pb-28 sm:pt-16 md:gap-20 md:pb-32 md:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-x-20 lg:px-10 lg:pb-36 lg:pt-24 xl:gap-x-24 xl:pb-40 xl:pt-28">
          {/* Left: copy */}
          <div className="min-w-0 max-w-[40rem]">
            <div className="mb-9">
              <HaloMark className="mb-3 block" width={92} height={28} />
              <SectionEyebrow>Wound Care · Saintly Home Health</SectionEyebrow>
            </div>

            <h1
              id="wc-hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)] xl:text-[clamp(4.85rem,5.2vw,7.25rem)]"
              style={{ color: NAVY }}
            >
              Wound Care at Home
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              Skilled nurses help manage wounds, monitor healing, and coordinate care with your
              doctor — all from the comfort of home.
            </p>
            <p className="mt-5 max-w-[36rem] text-[1.05rem] leading-[1.6] text-slate-600 sm:text-[1.15rem]">
              Medicare-certified, AHCCCS-approved, and physician-coordinated across Arizona.
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
              <a href="/referrals" className={BTN_DARK_OUTLINE}>
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

          {/* Right: image */}
          <div className="relative mx-auto min-w-0 w-full max-w-2xl lg:mx-0 lg:max-w-none">
            <div
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.85rem] bg-gradient-to-br from-[#FFC72C]/45 via-[#FFC72C]/15 to-transparent opacity-95 blur-[44px] sm:-inset-8 sm:rounded-[3rem]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -right-12 -top-16 hidden h-56 w-56 rounded-full bg-[#FFC72C]/45 blur-[72px] sm:block lg:-right-8 lg:-top-10 lg:h-72 lg:w-72"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -left-12 -bottom-16 hidden h-72 w-72 rounded-full bg-sky-200/55 blur-[90px] sm:block"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -inset-3 hidden rounded-[2.75rem] bg-gradient-to-br from-white/55 via-white/20 to-transparent ring-1 ring-white/65 sm:block"
              aria-hidden
            />

            <div className="relative aspect-[4/3] min-h-[300px] overflow-hidden rounded-[2rem] bg-slate-100 shadow-[0_50px_100px_-30px_rgba(15,23,42,0.32),0_0_80px_-20px_rgba(245,180,0,0.22)] ring-1 ring-white/85 sm:aspect-[5/4] sm:min-h-[400px] lg:aspect-[4/5] lg:min-h-[560px] lg:rounded-[2.5rem] xl:min-h-[640px]">
              <Image
                src={IMG.hero}
                alt={HERO_IMAGE_ALT}
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
                className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#FFC72C]/[0.10]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/22 to-transparent"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/45"
                aria-hidden
              />
            </div>

            {/* Floating credential card */}
            <div className="absolute -bottom-6 left-4 hidden items-center gap-3 rounded-2xl border border-white/90 bg-white/95 px-5 py-4 shadow-[0_24px_56px_-22px_rgba(15,23,42,0.30)] backdrop-blur-sm sm:flex lg:left-8 lg:-bottom-10">
              <span
                className="pointer-events-none absolute -inset-3 -z-10 rounded-3xl bg-[#FFC72C]/22 blur-2xl"
                aria-hidden
              />
              <GoldIconTile size="md">
                <ShieldCheck className="h-7 w-7" strokeWidth={1.9} aria-hidden />
              </GoldIconTile>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Skilled Wound Care
                </p>
                <p className="truncate text-[15px] font-semibold leading-snug" style={{ color: NAVY }}>
                  Medicare Certified · AZ Licensed
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Curved veil into Why section */}
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
          <span className="pointer-events-none absolute left-1/2 top-[0.125rem] h-px w-[min(32rem,80%)] max-w-xl -translate-x-1/2 bg-gradient-to-r from-transparent via-[#FFC72C]/55 to-transparent blur-[3px]" />
        </div>
      </section>

      {/* ─── Why families choose Saintly — premium intro container ──────── */}
      <section
        className="relative scroll-mt-[4.75rem] px-5 pb-[clamp(5.75rem,13vw,8.75rem)] pt-[clamp(2rem,6vw,3.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="wc-why-heading"
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <span className="relative mx-auto mb-3 block w-fit">
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[3.75rem] w-[19rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFC72C]/30 blur-[28px]"
            />
            <HaloMark className="relative mx-auto block" width={88} height={28} />
          </span>
          <SectionEyebrow>Why families choose Saintly</SectionEyebrow>
          <h2
            id="wc-why-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[clamp(2.25rem,4vw,3.75rem)] md:text-[clamp(2.5rem,3.5vw,4.25rem)]"
            style={{ color: NAVY }}
          >
            Wound-focused care from a trusted home health team
          </h2>
        </div>

        <div className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:gap-8 lg:grid-cols-3">
          {WHY_CARDS.map(({ title, body, icon: Icon }) => (
            <article
              key={title}
              className="relative flex h-full flex-col overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-9 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-11"
            >
              <span
                className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#FFC72C]/18 blur-2xl"
                aria-hidden
              />
              <GoldIconTile size="lg">
                <Icon className="h-7 w-7" strokeWidth={1.9} />
              </GoldIconTile>
              <h3
                className="mt-7 text-[1.45rem] font-semibold leading-[1.15] tracking-[-0.015em] sm:text-[1.55rem]"
                style={{ color: NAVY }}
              >
                {title}
              </h3>
              <p className="mt-4 text-[1.1rem] leading-[1.65] text-slate-700 sm:text-[1.18rem]">
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ─── Gentle wound care — editorial photo cards ────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        style={{ background: BG_CREAM_SOFT }}
        aria-labelledby="wc-gentle-heading"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-full max-w-[1700px] -translate-x-1/2 rounded-full bg-[#FFC72C]/12 blur-[150px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <HaloMark className="mx-auto mb-3 block" width={88} height={28} />
          <SectionEyebrow>Skilled nurses at home</SectionEyebrow>
          <h2
            id="wc-gentle-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[clamp(2.25rem,4vw,3.75rem)] md:text-[clamp(2.5rem,3.5vw,4rem)]"
            style={{ color: NAVY }}
          >
            Gentle wound care without leaving home
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.6] text-slate-600 sm:text-[1.28rem]">
            Our nurses help manage wound care, dressing changes, and communication with your doctor
            so recovery feels safer and less stressful.
          </p>
        </div>

        <ul className="relative mx-auto mt-16 grid min-w-0 max-w-[84rem] gap-7 sm:gap-8 lg:grid-cols-3">
          {GENTLE_PHOTO_CARDS.map(({ eyebrow, title, body, image, alt }) => (
            <li key={title} className="group h-full">
              <article className="relative flex h-full flex-col overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)]">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-amber-50">
                  <Image
                    src={image}
                    alt={alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw"
                    quality={92}
                    className="object-cover transition duration-500 group-hover:scale-[1.04]"
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/35 via-transparent to-transparent"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-transparent via-transparent to-[#FFC72C]/[0.10]"
                    aria-hidden
                  />
                </div>
                <div className="flex flex-1 flex-col gap-3 px-7 py-7 sm:px-8 sm:py-8">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.22em] text-amber-700">
                    {eyebrow}
                  </span>
                  <h3
                    className="text-[1.3rem] font-semibold leading-[1.2] tracking-[-0.01em] sm:text-[1.4rem]"
                    style={{ color: NAVY }}
                  >
                    {title}
                  </h3>
                  <p className="mt-1 flex-1 text-[1.05rem] leading-[1.62] text-slate-700">
                    {body}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Conditions — premium hero panel + clean grid ─────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 pb-[clamp(5.75rem,13vw,8.75rem)] pt-[clamp(4.5rem,10vw,7rem)] sm:px-7 lg:px-10"
        aria-labelledby="conditions-heading"
        style={{ background: BG_CREAM_GOLD }}
      >
        <div
          className="pointer-events-none absolute -left-32 top-1/3 h-[26rem] w-[26rem] rounded-full bg-[#FFC72C]/12 blur-[120px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 top-12 h-[24rem] w-[24rem] rounded-full bg-sky-200/40 blur-[120px]"
          aria-hidden
        />

        {/* Premium image + heading panel — same shape as homepage team banner */}
        <div
          className="relative mx-auto max-w-[84rem] overflow-hidden rounded-[2.25rem] border border-amber-100/80 shadow-[0_54px_120px_-44px_rgba(15,23,42,0.30)] md:rounded-[2.5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#FFC72C]/[0.20] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 items-stretch gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            {/* Image */}
            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[440px] lg:rounded-l-[2.5rem]">
              <Image
                src={IMG.woundTypesSupporting}
                alt="Saintly clinician supporting an older patient in a bright, cozy living room during a respectful home nursing visit"
                fill
                sizes="(max-width: 1024px) 100vw, 48vw"
                quality={92}
                className="object-cover object-center"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#FFC72C]/15 via-transparent to-transparent"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent to-white/0 lg:to-[#fffaf0]/35"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40"
                aria-hidden
              />
            </div>

            {/* Copy */}
            <div className="relative flex min-w-0 flex-col justify-center gap-6 px-7 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div>
                <HaloMark className="mb-4 block" width={92} height={28} />
                <SectionEyebrow>Conditions we help with</SectionEyebrow>
                <h2
                  id="conditions-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Wound types our nurses routinely manage at home
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Skilled, physician-directed wound care for a range of common and chronic
                  conditions — delivered safely in the comfort of home.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                {[
                  "Physician-directed care plans",
                  "Scheduled dressing changes",
                  "Infection-watch teaching",
                  "Coordinated with your doctor",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <GoldIconTile size="sm">
                      <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                    </GoldIconTile>
                    <span className="pt-1.5 text-[1.05rem] font-semibold leading-[1.45] text-[#0c1929] sm:text-[1.1rem]">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Conditions grid */}
        <ul className="relative mx-auto mt-14 grid min-w-0 max-w-[84rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {CONDITIONS.map(({ title, body, icon: Icon }) => (
            <li key={title} className="group h-full">
              <article className="relative flex h-full flex-col gap-6 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                <span
                  className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFC72C]/20 blur-2xl"
                  aria-hidden
                />
                <GoldIconTile size="md">
                  <Icon className="h-7 w-7" strokeWidth={1.9} />
                </GoldIconTile>
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

      {/* ─── What a visit can include — single premium panel ─────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="wc-visit-include-heading"
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
          <div
            className="pointer-events-none absolute -left-24 -bottom-24 h-[22rem] w-[22rem] rounded-full bg-sky-200/40 blur-[100px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 items-stretch gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            {/* Image collage */}
            <div className="relative px-5 pt-9 pb-2 sm:px-9 sm:pt-12 lg:px-12 lg:py-12">
              <div className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.85rem] bg-amber-50 shadow-[0_44px_100px_-40px_rgba(15,23,42,0.32)] ring-1 ring-white/85 sm:aspect-[5/4] md:rounded-[2rem] lg:aspect-[4/5]">
                  <Image
                    src={IMG.visit1}
                    alt="Saintly nurse offering gentle caregiver guidance beside medical supplies within a softly lit cozy home"
                    fill
                    sizes="(max-width: 1024px) min(94vw, 540px), 46vw"
                    quality={92}
                    className="object-cover object-center"
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#FFC72C]/12 via-transparent to-transparent"
                    aria-hidden
                  />
                </div>

                {/* Floating second photo */}
                <div className="relative mt-5 ml-auto w-[68%] max-w-[18rem] sm:absolute sm:-bottom-8 sm:-right-4 sm:mt-0 sm:w-[60%] sm:max-w-[20rem] lg:-bottom-10 lg:-right-6">
                  <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[1.5rem] border-[3px] border-white bg-amber-50 shadow-[0_30px_70px_-28px_rgba(15,23,42,0.40)] sm:rounded-[1.75rem]">
                    <Image
                      src={IMG.visit2}
                      alt="Nurse documenting care on tablet while chatting with a relaxed patient seated comfortably on the couch"
                      fill
                      sizes="(max-width: 1024px) 200px, 280px"
                      quality={92}
                      className="object-cover object-center"
                    />
                  </div>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-3 -z-10 rounded-[1.85rem] bg-[#FFC72C]/22 blur-2xl"
                  />
                </div>
              </div>
            </div>

            {/* Copy + checklist */}
            <div className="relative flex min-w-0 flex-col justify-center gap-7 px-7 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div>
                <HaloMark className="mb-4 block" width={92} height={28} />
                <SectionEyebrow>During your visit</SectionEyebrow>
                <h2
                  id="wc-visit-include-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  What a visit can include
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Practical, physician-directed support your nurse delivers with patience and
                  clarity — so wound care feels guided, never guessed at.
                </p>
              </div>
              <ul className="space-y-3.5 sm:space-y-4">
                {VISIT_INCLUDES.map((title) => (
                  <li key={title}>
                    <span className="flex items-start gap-4 rounded-2xl border border-white/95 bg-white/95 px-5 py-4 shadow-[0_18px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 sm:px-6 sm:py-5">
                      <GoldIconTile size="sm">
                        <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                      </GoldIconTile>
                      <span className="pt-1 text-[1.08rem] font-semibold leading-[1.5] text-[#0c1929] sm:text-[1.16rem]">
                        {title}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Healing comfort — premium lifestyle reassurance ─────────────── */}
      <section
        className="relative overflow-x-hidden px-5 pb-[clamp(5.75rem,13vw,8.75rem)] pt-[clamp(4rem,10vw,7rem)] sm:px-7 lg:px-10"
        aria-labelledby="wc-comfort-heading"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-full max-w-[1700px] -translate-x-1/2 rounded-full bg-[#FFC72C]/10 blur-[150px]"
          aria-hidden
        />

        <div
          className="relative mx-auto min-w-0 max-w-[84rem] overflow-hidden rounded-[2.25rem] border border-amber-100/80 shadow-[0_54px_120px_-44px_rgba(15,23,42,0.30)] md:rounded-[2.5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#FFC72C]/[0.18] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 items-stretch gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            {/* Image */}
            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[460px] lg:rounded-l-[2.5rem]">
              <Image
                src={IMG.lifestyle}
                alt="Older gentleman resting calmly on couch with a cleanly bandaged leg elevated, soft natural light nearby"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                quality={92}
                className="object-cover object-[center_38%]"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#FFC72C]/12 via-transparent to-transparent"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent to-white/0 lg:to-[#fffaf0]/35"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40"
                aria-hidden
              />
            </div>

            {/* Copy */}
            <div className="relative flex min-w-0 flex-col justify-center gap-7 px-7 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div>
                <HaloMark className="mb-4 block" width={92} height={28} />
                <SectionEyebrow>Peace of mind at home</SectionEyebrow>
                <h2
                  id="wc-comfort-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Healing support with comfort and dignity
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Wound care can feel overwhelming. Saintly helps patients receive skilled support
                  at home while protecting comfort, privacy, and peace of mind.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                {[
                  "Skilled nursing visits",
                  "Privacy-respecting care",
                  "Calm, gentle communication",
                  "Family kept in the loop",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <GoldIconTile size="sm">
                      <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                    </GoldIconTile>
                    <span className="pt-1.5 text-[1.05rem] font-semibold leading-[1.45] text-[#0c1929] sm:text-[1.1rem]">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Medicare Coverage — reference panel ────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="wc-coverage-heading"
      >
        <div
          className="relative mx-auto max-w-[85rem] overflow-hidden rounded-[2.25rem] border border-amber-100/90 px-9 py-16 shadow-[0_54px_120px_-42px_rgba(15,23,42,0.34)] sm:px-14 sm:py-[4.5rem] md:px-[4.25rem] md:py-[5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-28 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[#FFC72C]/[0.22] blur-[110px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-20 -bottom-24 h-[22rem] w-[22rem] rounded-full bg-sky-200/40 blur-[100px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-16">
            <div className="min-w-0">
              <HaloMark className="mb-4 block" width={92} height={28} />
              <SectionEyebrow>Medicare &amp; payer coverage</SectionEyebrow>
              <h2
                id="wc-coverage-heading"
                className="mt-5 text-balance text-[clamp(1.95rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.1rem,3.5vw,3.35rem)] lg:text-[clamp(2.25rem,3.2vw,3.65rem)]"
                style={{ color: NAVY }}
              >
                Medicare May Cover Wound Care at Home
              </h2>
              <p className="mt-7 text-[1.22rem] leading-[1.7] text-slate-800 sm:text-[1.32rem] sm:leading-[1.72]">
                Medicare may cover wound care at home when skilled care is medically necessary and
                ordered by a physician. Coverage still depends on home health eligibility. Saintly
                Home Health helps coordinate the referral, orders, and documentation so the process
                is smoother for patients and families.
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

      {/* ─── Process — gold numbered cards w/ connector rail ────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="referral-heading"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Referral process</SectionEyebrow>
          <h2
            id="referral-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Three steps from referral to home visits
          </h2>
        </div>

        <ol className="relative mx-auto mt-16 grid min-w-0 max-w-[85rem] gap-8 lg:grid-cols-3 lg:gap-8 xl:gap-10">
          <span
            aria-hidden
            className="pointer-events-none absolute left-[12%] right-[12%] top-[3.75rem] hidden h-[2px] bg-gradient-to-r from-transparent via-[#FFC72C]/65 to-transparent lg:block"
          />
          {REFERRAL_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="relative flex flex-col">
                <div className="relative flex flex-1 flex-col rounded-[2rem] border border-amber-100/80 bg-white/95 p-10 shadow-[0_34px_80px_-30px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:shadow-[0_42px_100px_-30px_rgba(245,180,0,0.32)] sm:p-11">
                  <div className="flex items-center gap-5">
                    <span className="relative">
                      <GoldIconTile size="lg">
                        <Icon className="h-7 w-7" strokeWidth={2} />
                      </GoldIconTile>
                      <span className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-white text-[13px] font-bold text-amber-700 shadow-[0_4px_10px_-2px_rgba(15,23,42,0.18)]">
                        {idx + 1}
                      </span>
                    </span>
                    <h3
                      className="text-[1.45rem] font-semibold leading-tight tracking-[-0.015em] sm:text-[1.6rem]"
                      style={{ color: NAVY }}
                    >
                      {step.title}
                    </h3>
                  </div>
                  <p className="mt-6 flex-1 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.25rem] sm:leading-[1.72]">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,12.5vw,8.5rem)] sm:px-7 lg:px-10"
        aria-labelledby="wc-faq-heading"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div
          className="pointer-events-none absolute -right-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-[#FFC72C]/15 blur-[130px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-32 bottom-0 h-[24rem] w-[24rem] rounded-full bg-sky-200/40 blur-[120px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2
            id="wc-faq-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Common questions
          </h2>
        </div>

        <div className="relative mx-auto mt-14 max-w-3xl space-y-5">
          {FAQS.map(({ q, a }, i) => (
            <details
              key={q}
              {...(i === 0 ? { open: true } : {})}
              className="group overflow-hidden rounded-[1.5rem] border border-amber-100/80 bg-white/95 shadow-[0_24px_58px_-28px_rgba(15,23,42,0.2)] ring-1 ring-amber-100/40 transition-shadow open:shadow-[0_32px_72px_-28px_rgba(245,180,0,0.30)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-[1.5rem] px-8 py-7 outline-none transition-colors hover:bg-amber-50/60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf0] sm:px-10 sm:py-[2.125rem]">
                <span className="text-left text-[1.22rem] font-semibold leading-[1.35] text-[#0c1929] sm:text-[1.32rem]">
                  {q}
                </span>
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-200/80 bg-amber-50 text-amber-700 transition duration-300 group-open:rotate-180 group-open:border-amber-300 group-open:bg-gradient-to-br group-open:from-[#FFC72C] group-open:to-[#F5B400] group-open:text-[#0c1929]"
                  aria-hidden
                >
                  <ChevronDown className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                </span>
              </summary>
              <div className="border-t border-amber-100/70 px-8 pb-8 pt-6 sm:px-10 sm:pb-9 sm:pt-7">
                <p className="text-[1.18rem] leading-[1.72] text-slate-700 sm:text-[1.22rem] sm:leading-[1.74]">
                  {a}
                </p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* ─── Final CTA — dark navy w/ gold accents ────────────────────────── */}
      <section
        className="relative mx-4 my-16 overflow-x-hidden rounded-[2rem] px-7 py-[4.5rem] text-white shadow-[0_60px_128px_-46px_rgba(15,23,42,0.58)] ring-1 ring-amber-200/15 sm:mx-6 sm:px-10 sm:py-[5rem] md:mx-auto md:max-w-[86rem] md:px-16 md:py-[5.25rem] lg:my-24 lg:px-20 lg:py-[5.75rem]"
        aria-labelledby="wc-final-cta-heading"
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
              Send a referral
            </p>
            <h2
              id="wc-final-cta-heading"
              className="text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[clamp(2.35rem,4vw,3.85rem)] lg:text-[clamp(2.5rem,3.5vw,4.25rem)]"
            >
              Need wound care at home?
            </h2>
            <p className="mt-7 max-w-2xl text-[1.3rem] leading-[1.68] text-amber-50/90 sm:text-[1.42rem] sm:leading-[1.7]">
              Call Saintly Home Health and we’ll help confirm your referral, coverage, and next steps.
            </p>
            <p className="mt-6 max-w-2xl text-[13px] font-semibold uppercase leading-[1.75] tracking-[0.12em] text-amber-100/85 sm:text-[14px]">
              Medicare-Certified
              <span className="mx-2 text-[#FFC72C]/95">•</span>
              AHCCCS Provider
              <span className="mx-2 text-[#FFC72C]/95">•</span>
              Serving Arizona
            </p>
          </div>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8 lg:flex-col lg:items-stretch lg:gap-6 xl:flex-row xl:items-center xl:gap-10">
            <a href={TEL} className={BTN_GOLD}>
              <span
                className="pointer-events-none absolute -inset-2 -z-10 rounded-full bg-[#FFC72C]/40 blur-2xl"
                aria-hidden
              />
              <Phone className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              Call or Text {PHONE_DISPLAY}
            </a>
            <a href="/referrals" className={BTN_OUTLINE_ON_DARK}>
              Send a Referral
              <span className="text-lg leading-none text-[#FFC72C]" aria-hidden>
                →
              </span>
            </a>
          </div>
        </div>

        {/* Compact contact strip — gold-accented icons */}
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

      <MarketingSiteFooter />

      <MarketingStickyMobileCta secondaryHref="/referrals" secondaryLabel="Send a Referral" />
    </div>
  );
}
