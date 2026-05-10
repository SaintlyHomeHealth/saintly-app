import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bandage,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  Heart,
  HeartHandshake,
  Mail,
  MapPin,
  MessageCircle,
  PhoneCall,
  Phone,
  Printer,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
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
  BG_PANEL_CREAM,
  BTN_DARK_OUTLINE,
  BTN_GOLD,
  BTN_GOLD_SM,
  BTN_OUTLINE_ON_DARK,
  CREAM,
  FAX_TEL,
  GoldIconTile,
  NAVY,
  SectionEyebrow,
  TrustPill,
} from "./marketing-design";
import { MARKETING_NAV_DEFAULT } from "./marketing-nav";

const HERO_IMAGE_SRC =
  process.env.NEXT_PUBLIC_MARKETING_HERO_URL ||
  "/marketing/caring_healthcare_at_home_setting.png";
const HERO_IMAGE_ALT =
  "Saintly Home Health nurse taking blood pressure for an older woman in a sunlit living room";

const TEAM_BANNER_IMAGE_SRC = "/marketing/healthcare_team_in_a_home_setting.png";
const TEAM_BANNER_IMAGE_ALT =
  "Four Saintly Home Health clinicians smiling in a warm, sunlit home setting";

const PERSONAL_CARDS = [
  {
    eyebrow: "Comfort",
    title: "Familiar mornings, familiar home",
    body: "Comforting routines and a familiar home help patients feel calm, safe, and in control.",
    image: "/marketing/quiet_morning_reflection_by_the_window.png",
    alt: "Older woman holding a warm mug while looking peacefully out a sunlit window",
  },
  {
    eyebrow: "Independence",
    title: "Stronger together, every day",
    body: "Therapy and skilled visits help patients regain mobility, confidence, and the freedom to keep moving.",
    image: "/marketing/a_joyful_stroll_in_the_park.png",
    alt: "Smiling older couple walking arm-in-arm down a sunlit, tree-lined neighborhood sidewalk",
  },
  {
    eyebrow: "Family",
    title: "Caring for what matters most",
    body: "We support families with clear communication and warm, attentive care for their loved ones.",
    image: "/marketing/cozy_embrace_in_a_sunlit_living_room.png",
    alt: "Adult daughter and her older mother sharing a warm embrace on a sunlit living-room couch",
  },
] as const;

const HERO_TRUST_PILLS = [
  "Original Medicare Accepted",
  "AHCCCS Approved",
  "Skilled Nursing",
  "Therapy at Home",
  "Arizona Home Health",
] as const;

const TRUST_ITEMS = [
  { title: "Medicare Certified", icon: ShieldCheck },
  { title: "Arizona Licensed", icon: ClipboardCheck },
  { title: "AHCCCS Provider", icon: BadgeCheck },
  { title: "Skilled Nursing & Therapy", icon: Stethoscope },
  { title: "Serving Greater Phoenix", icon: MapPin },
] as const;

const SERVICE_CARDS = [
  {
    title: "Skilled Nursing",
    body: "Professional nursing care including assessments, medication management, disease education, and care coordination.",
    href: "/services#featured",
    icon: Stethoscope,
    image: "/marketing/caring_hands_in_a_home_setting.png",
    alt: "Saintly Home Health nurse reviewing medication bottles with an older woman at home",
  },
  {
    title: "Wound Care",
    body: "Advanced wound care for complex wounds, pressure injuries, surgical sites, and chronic conditions.",
    href: "/services/wound-care",
    icon: Bandage,
    image: "/marketing/caring_hands_in_a_peaceful_home_setting.png",
    alt: "Saintly Home Health nurse applying a clean bandage to an older patient's leg in her living room",
  },
  {
    title: "Physical Therapy",
    body: "Restore mobility, reduce pain, and improve strength with personalized therapy plans tailored to your goals.",
    href: "/services/physical-therapy",
    icon: Dumbbell,
    image: "/marketing/home_therapy_session_with_care_and_support.png",
    alt: "Saintly Home Health therapist guiding an older man through a strength exercise with a small dumbbell at home",
  },
  {
    title: "Home Health Aide",
    body: "Compassionate assistance with personal care, bathing, dressing, meal prep, and light housekeeping.",
    href: "/services#additional",
    icon: HeartHandshake,
    image: "/marketing/caring_meal_delivery_in_a_cozy_home.png",
    alt: "Saintly Home Health aide bringing a warm meal to an older man at his cozy dining table",
  },
] as const;

const WHY_CARDS = [
  {
    title: "Compassionate care at home",
    body: "We treat you like family with dignity, respect, and kindness on every visit.",
    icon: Heart,
  },
  {
    title: "Doctor coordination",
    body: "We partner with your providers for seamless, well-documented home health care.",
    icon: Users,
  },
  {
    title: "Clear family communication",
    body: "We keep you informed with timely updates and open communication throughout care.",
    icon: MessageCircle,
  },
  {
    title: "Reliable local clinical team",
    body: "Experienced professionals who live and work in your community across Arizona.",
    icon: Activity,
  },
] as const;

const COVERAGE_BULLETS = [
  "Original Medicare accepted",
  "AHCCCS Medicaid approved",
  "Physician orders may be required",
  "Care must meet eligibility requirements",
  "Medicare Supplement may help cover remaining costs",
] as const;

const PROCESS_STEPS = [
  {
    title: "Call or Send Referral",
    body: "Reach our Tempe-based team. We verify basic information and answer your questions in plain language.",
    icon: PhoneCall,
  },
  {
    title: "We Coordinate With the Doctor",
    body: "We help obtain the physician order and required documentation so nothing slows down care.",
    icon: Stethoscope,
  },
  {
    title: "Care Begins at Home",
    body: "A licensed clinician visits the patient and builds a personalized plan of care.",
    icon: CalendarCheck,
  },
] as const;

const CITY_CHIPS = [
  "Tempe",
  "Phoenix",
  "Mesa",
  "Chandler",
  "Gilbert",
  "Scottsdale",
  "Glendale",
  "Peoria",
  "Avondale",
  "Surprise",
  "Queen Creek",
] as const;

export function MarketingHome() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_DEFAULT} />

      {/* ─── Hero — premium cream/gold panel, gold CTA ────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="hero-heading"
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
              <SectionEyebrow>Saintly Home Health</SectionEyebrow>
            </div>

            <h1
              id="hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)] xl:text-[clamp(4.85rem,5.2vw,7.25rem)]"
              style={{ color: NAVY }}
            >
              Home Health Care That Goes Above
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              Skilled nursing, therapy, and personal care support delivered safely in the comfort of
              home.
            </p>
            <p className="mt-5 max-w-[36rem] text-[1.05rem] leading-[1.6] text-slate-600 sm:text-[1.15rem]">
              Medicare-certified skilled nursing, wound care, therapy, and home health aide support
              across Greater Phoenix.
            </p>

            <div className="mt-12 flex flex-col gap-4 sm:mt-14 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
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

            {/* Trust pills */}
            <ul className="mt-10 flex flex-wrap gap-2.5 sm:mt-12 sm:gap-3">
              {HERO_TRUST_PILLS.map((pill) => (
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
                src={HERO_IMAGE_SRC}
                alt={HERO_IMAGE_ALT}
                fill
                sizes="(max-width: 1024px) min(100vw, 720px), min(640px, 46vw)"
                quality={92}
                className="object-cover object-center lg:object-[68%_center]"
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

            {/* Floating credential card with gold halo backing */}
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
                  Trusted Care
                </p>
                <p className="truncate text-[15px] font-semibold leading-snug" style={{ color: NAVY }}>
                  Medicare Certified · AZ Licensed
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Curved veil */}
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

      {/* ─── Trust strip — premium gold-tile chip card ────────────────────── */}
      <div className="relative z-10 -mt-10 overflow-x-hidden px-5 pb-20 sm:-mt-14 sm:px-7 md:pb-24 lg:px-10">
        <div className="relative mx-auto max-w-[84rem]">
          <div
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.75rem] bg-gradient-to-b from-white/0 via-[#FFC72C]/[0.08] to-transparent blur-2xl"
            aria-hidden
          />
          <div
            className="relative overflow-hidden rounded-[1.85rem] border border-amber-100/70 px-6 py-9 shadow-[0_30px_72px_-32px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 backdrop-blur-md sm:px-10 sm:py-10 md:rounded-[2rem] md:px-12 md:py-12"
            style={{ background: BG_PANEL_CREAM }}
          >
            <ul className="grid gap-7 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-8 md:grid-cols-3 md:gap-y-10 lg:grid-cols-5 lg:gap-x-6 lg:gap-y-8 xl:gap-x-8">
              {TRUST_ITEMS.map(({ title, icon: Icon }) => (
                <li key={title} className="flex items-center gap-4 sm:gap-5 lg:gap-3.5 xl:gap-4">
                  <GoldIconTile size="md">
                    <Icon className="h-7 w-7" strokeWidth={1.85} />
                  </GoldIconTile>
                  <p
                    className="text-[16px] font-semibold leading-[1.25] tracking-tight sm:text-[17px] lg:text-[15.5px] xl:text-[16.5px]"
                    style={{ color: NAVY }}
                  >
                    {title}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ─── Services — premium cream/gold cards ──────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 pb-28 pt-4 sm:px-7 md:pb-32 lg:px-10 lg:pb-36"
        id="services"
        aria-labelledby="services-heading"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-full max-w-[1700px] -translate-x-1/2 rounded-full bg-[#FFC72C]/12 blur-[150px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-3xl pt-20 text-center sm:pt-24">
          <HaloMark className="mx-auto mb-3 block" width={88} height={28} />
          <SectionEyebrow>Our services</SectionEyebrow>
          <h2
            id="services-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[clamp(2.25rem,4vw,3.75rem)] md:text-[clamp(2.5rem,3.5vw,4rem)]"
            style={{ color: NAVY }}
          >
            Expert care. Right at home.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.6] text-slate-600 sm:text-[1.28rem]">
            Personalized care plans designed to help you heal, regain strength, and maintain
            independence in the comfort of home.
          </p>
        </div>

        <div className="relative mx-auto mt-16 grid min-w-0 max-w-[84rem] grid-cols-1 gap-7 sm:grid-cols-2 sm:gap-8 lg:gap-9 xl:grid-cols-4 xl:gap-7">
          {SERVICE_CARDS.map(({ title, body, href, icon: Icon, image, alt }) => (
            <Link
              key={title}
              href={href}
              className="group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-amber-100/70 bg-white/95 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)]"
            >
              {/* Photo */}
              <div className="relative aspect-[16/11] w-full overflow-hidden bg-amber-50">
                <Image
                  src={image}
                  alt={alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 48vw, 22vw"
                  quality={90}
                  className="object-cover transition duration-500 group-hover:scale-[1.04]"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white via-white/35 to-transparent"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-transparent via-transparent to-[#FFC72C]/[0.08]"
                  aria-hidden
                />
              </div>

              {/* Content */}
              <div className="relative -mt-8 flex flex-1 flex-col gap-5 px-7 pb-8 sm:px-8 sm:pb-9">
                <span
                  className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFC72C]/22 blur-2xl"
                  aria-hidden
                />
                <GoldIconTile size="md" className="relative z-10 ring-2 ring-white">
                  <Icon className="h-7 w-7" strokeWidth={1.9} />
                </GoldIconTile>
                <div className="flex flex-1 flex-col">
                  <h3
                    className="text-[1.28rem] font-semibold leading-[1.2] tracking-[-0.01em] sm:text-[1.35rem]"
                    style={{ color: NAVY }}
                  >
                    {title}
                  </h3>
                  <p className="mt-3.5 flex-1 text-[1.02rem] leading-[1.62] text-slate-700">
                    {body}
                  </p>
                  <span className="mt-7 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-amber-700 transition group-hover:text-amber-800">
                    Learn more
                    <ArrowRight
                      className="h-4 w-4 transition group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Team / Trust banner — wide photo card ────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 pb-24 sm:px-7 sm:pb-28 md:pb-32 lg:px-10"
        aria-labelledby="team-heading"
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
            {/* Image */}
            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[440px] lg:rounded-l-[2.5rem]">
              <Image
                src={TEAM_BANNER_IMAGE_SRC}
                alt={TEAM_BANNER_IMAGE_ALT}
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
                <SectionEyebrow>Our team</SectionEyebrow>
                <h2
                  id="team-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Trusted local care team
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Licensed professionals. Clear communication. Coordinated care with your doctor.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                {[
                  "Medicare-certified clinicians",
                  "Tempe-based, Arizona-wide",
                  "Live updates for families",
                  "Direct physician coordination",
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

      {/* ─── Why Saintly — premium cream/gold cards ───────────────────────── */}
      <section
        className="relative overflow-hidden px-5 py-24 sm:px-7 sm:py-28 md:py-32 lg:px-10 lg:py-36"
        id="why-saintly"
        aria-labelledby="why-heading"
        style={{ background: BG_CREAM_GOLD }}
      >
        <div
          className="pointer-events-none absolute -left-32 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-[#FFC72C]/12 blur-[110px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 -top-12 h-[26rem] w-[26rem] rounded-full bg-sky-200/40 blur-[110px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <HaloMark className="mx-auto mb-3 block" width={88} height={28} />
          <SectionEyebrow>Why families choose Saintly</SectionEyebrow>
          <h2
            id="why-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[clamp(2.25rem,4vw,3.75rem)] md:text-[clamp(2.5rem,3.5vw,4rem)]"
            style={{ color: NAVY }}
          >
            Care you can count on.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.6] text-slate-600 sm:text-[1.28rem]">
            A clinical team that shows up when it matters — with skill, kindness, and clear
            communication.
          </p>
        </div>

        <div className="relative mx-auto mt-16 grid min-w-0 max-w-[84rem] gap-7 sm:grid-cols-2 sm:gap-8 lg:gap-10">
          {WHY_CARDS.map(({ title, body, icon: Icon }) => (
            <article
              key={title}
              className="relative flex h-full flex-col overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-9 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-11"
            >
              <span
                className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#FFC72C]/18 blur-2xl"
                aria-hidden
              />
              <div className="flex items-center gap-5">
                <GoldIconTile size="lg">
                  <Icon className="h-7 w-7" strokeWidth={1.9} />
                </GoldIconTile>
                <h3
                  className="text-[1.4rem] font-semibold leading-[1.15] tracking-[-0.015em] sm:text-[1.55rem]"
                  style={{ color: NAVY }}
                >
                  {title}
                </h3>
              </div>
              <p className="mt-6 text-[1.08rem] leading-[1.65] text-slate-700 sm:text-[1.13rem]">
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ─── Care that feels personal — lifestyle photo cards ────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="personal-heading"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-full max-w-[1700px] -translate-x-1/2 rounded-full bg-[#FFC72C]/12 blur-[150px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <HaloMark className="mx-auto mb-3 block" width={88} height={28} />
          <SectionEyebrow>Care that feels personal</SectionEyebrow>
          <h2
            id="personal-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[clamp(2.25rem,4vw,3.75rem)] md:text-[clamp(2.5rem,3.5vw,4rem)]"
            style={{ color: NAVY }}
          >
            Care that supports independence, comfort, and peace of mind.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.6] text-slate-600 sm:text-[1.28rem]">
            From skilled visits to everyday support, our team helps patients remain safe and
            comfortable at home.
          </p>
        </div>

        <ul className="relative mx-auto mt-16 grid min-w-0 max-w-[84rem] gap-7 sm:gap-8 lg:grid-cols-3">
          {PERSONAL_CARDS.map(({ eyebrow, title, body, image, alt }) => (
            <li key={title} className="group h-full">
              <article className="relative flex h-full flex-col overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)]">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-amber-50">
                  <Image
                    src={image}
                    alt={alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw"
                    quality={90}
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

      {/* ─── Medicare Coverage — Saintly cream/gold reference panel ──────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="home-coverage-heading"
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
                id="home-coverage-heading"
                className="mt-5 text-balance text-[clamp(1.95rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.1rem,3.5vw,3.35rem)] lg:text-[clamp(2.25rem,3.2vw,3.65rem)]"
                style={{ color: NAVY }}
              >
                Medicare May Cover Home Health Care
              </h2>
              <p className="mt-7 text-[1.22rem] leading-[1.7] text-slate-800 sm:text-[1.32rem] sm:leading-[1.72]">
                Saintly Home Health is Medicare certified, AHCCCS approved, and works directly with
                physicians to coordinate home health services across Greater Phoenix. We help verify
                eligibility before care begins.
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
                    <span className="pt-1 text-[1.08rem] font-semibold leading-[1.5] text-[#0c1929] sm:text-[1.16rem]">
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
        aria-labelledby="home-process-heading"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2
            id="home-process-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Getting Started Is Simple
          </h2>
        </div>

        <ol className="relative mx-auto mt-16 grid min-w-0 max-w-[85rem] gap-8 lg:grid-cols-3 lg:gap-8 xl:gap-10">
          <span
            aria-hidden
            className="pointer-events-none absolute left-[12%] right-[12%] top-[3.75rem] hidden h-[2px] bg-gradient-to-r from-transparent via-[#FFC72C]/65 to-transparent lg:block"
          />
          {PROCESS_STEPS.map((step, idx) => {
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
                  <p className="mt-6 flex-1 text-[1.15rem] leading-[1.7] text-slate-700 sm:text-[1.22rem] sm:leading-[1.72]">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ─── Service Area — premium cream/gold panel ──────────────────────── */}
      <section
        className="overflow-x-hidden px-5 py-24 sm:px-7 sm:py-28 md:py-32 lg:px-10"
        id="service-area"
        aria-labelledby="area-heading"
        style={{ backgroundColor: CREAM }}
      >
        <div
          className="relative mx-auto max-w-[84rem] overflow-hidden rounded-[2.25rem] border border-amber-100/80 px-6 py-14 shadow-[0_54px_120px_-44px_rgba(15,23,42,0.30)] sm:px-10 sm:py-16 md:rounded-[2.5rem] md:px-14 md:py-20 lg:px-16 lg:py-24"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#FFC72C]/[0.22] blur-[110px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-20 -bottom-24 h-[22rem] w-[22rem] rounded-full bg-sky-200/45 blur-[100px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
            <div className="max-w-xl min-w-0">
              <HaloMark className="mb-4 block" width={92} height={28} />
              <SectionEyebrow>Proudly serving</SectionEyebrow>
              <h2
                id="area-heading"
                className="mt-5 text-balance text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[clamp(2.25rem,3.5vw,3.5rem)]"
                style={{ color: NAVY }}
              >
                Greater Phoenix &amp; surrounding communities
              </h2>
              <p className="mt-6 max-w-xl text-[1.15rem] leading-[1.6] text-slate-700 sm:text-[1.25rem]">
                We bring expert home health care to neighborhoods across the Valley. If you’re
                unsure whether we serve your area, give us a call.
              </p>

              <ul className="mt-10 flex flex-wrap gap-2.5 sm:gap-3">
                {CITY_CHIPS.map((city) => (
                  <li key={city}>
                    <span className="inline-flex rounded-full border border-amber-200/80 bg-white/95 px-4 py-2.5 text-[14px] font-semibold tracking-tight text-[#0c1929] shadow-[0_8px_18px_-8px_rgba(245,180,0,0.30)] backdrop-blur-sm sm:px-5 sm:text-[15px]">
                      {city}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-11 flex flex-wrap items-center gap-4">
                <a href={TEL} className={BTN_GOLD_SM}>
                  <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Call {PHONE_DISPLAY}
                </a>
                <span className="text-[14px] text-slate-700">
                  Tempe-based · Statewide partners
                </span>
              </div>
            </div>

            {/* Right column visual — soft halo composition */}
            <div className="relative min-w-0">
              <div className="relative mx-auto aspect-square w-full max-w-md sm:max-w-lg lg:max-w-none">
                <div
                  className="absolute -inset-[8%] rounded-full bg-gradient-to-br from-[#FFC72C]/32 via-amber-100/35 to-sky-200/30 blur-3xl"
                  aria-hidden
                />
                <div className="absolute inset-[2%] rounded-full border border-amber-200/45" aria-hidden />
                <div className="absolute inset-[10%] rounded-full border border-amber-200/55" aria-hidden />
                <div className="absolute inset-[19%] rounded-full border border-amber-200/65" aria-hidden />
                <div
                  className="absolute inset-[28%] rounded-full border border-white"
                  style={{ boxShadow: "inset 0 0 60px rgba(255,255,255,0.55)" }}
                  aria-hidden
                />
                <div
                  className="absolute inset-[20%] rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.48) 0%, rgba(255,255,255,0.18) 40%, rgba(255,255,255,0) 78%)",
                  }}
                  aria-hidden
                />
                <div className="absolute inset-[26%] rounded-full bg-[#FFC72C]/[0.32] blur-3xl" aria-hidden />

                {/* Phoenix-area location pings — gold */}
                <span
                  className="absolute left-[20%] top-[32%] h-2.5 w-2.5 rounded-full bg-[#FFC72C] shadow-[0_0_0_4px_rgba(255,199,44,0.30)]"
                  aria-hidden
                />
                <span
                  className="absolute left-[72%] top-[26%] h-2.5 w-2.5 rounded-full bg-[#FFC72C] shadow-[0_0_0_4px_rgba(255,199,44,0.30)]"
                  aria-hidden
                />
                <span
                  className="absolute left-[78%] top-[64%] h-2.5 w-2.5 rounded-full bg-[#FFC72C] shadow-[0_0_0_4px_rgba(255,199,44,0.30)]"
                  aria-hidden
                />
                <span
                  className="absolute left-[22%] top-[68%] h-2.5 w-2.5 rounded-full bg-[#FFC72C] shadow-[0_0_0_4px_rgba(255,199,44,0.30)]"
                  aria-hidden
                />

                <div className="absolute inset-0 flex items-center justify-center">
                  <Image
                    src="/marketing/saintly-icon-v3.png"
                    alt=""
                    width={1024}
                    height={1024}
                    sizes="(max-width: 1024px) 220px, 280px"
                    quality={94}
                    className="relative h-52 w-auto object-contain drop-shadow-[0_22px_38px_rgba(15,23,42,0.18)] sm:h-60 lg:h-72"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA — dark navy w/ gold accents ────────────────────────── */}
      <section
        className="relative mx-4 my-16 overflow-hidden rounded-[2rem] px-7 py-[4.5rem] text-white shadow-[0_60px_128px_-46px_rgba(15,23,42,0.58)] ring-1 ring-amber-200/15 sm:mx-6 sm:px-10 sm:py-[5rem] md:mx-auto md:max-w-[86rem] md:px-16 md:py-[5.25rem] lg:my-24 lg:px-20 lg:py-[5.75rem]"
        aria-labelledby="home-final-cta-heading"
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
              We’re here to help
            </p>
            <h2
              id="home-final-cta-heading"
              className="text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[clamp(2.35rem,4vw,3.85rem)] lg:text-[clamp(2.5rem,3.5vw,4.25rem)]"
            >
              Need home health care for yourself or a loved one?
            </h2>
            <p className="mt-7 max-w-2xl text-[1.3rem] leading-[1.68] text-amber-50/90 sm:text-[1.42rem] sm:leading-[1.7]">
              Verify your Medicare coverage, learn about services, and get the care you deserve —
              call our Tempe-based team today.
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
            <a href="/contact#form" className={BTN_OUTLINE_ON_DARK}>
              Request intake help
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

      <MarketingStickyMobileCta />
    </div>
  );
}
