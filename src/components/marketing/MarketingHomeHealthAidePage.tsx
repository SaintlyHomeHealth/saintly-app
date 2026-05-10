import Image from "next/image";
import {
  Bath,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Footprints,
  HandHeart,
  Heart,
  Mail,
  PhoneCall,
  Phone,
  Printer,
  Shirt,
  Sparkles,
  Stethoscope,
  UtensilsCrossed,
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
import { MARKETING_NAV_HOME_HEALTH_AIDE_PAGE } from "./marketing-nav";

const IMG = {
  hero: "/marketing/caring_companionship_in_a_cozy_home.png",
  intro: "/marketing/caring_support_in_a_cozy_home.png",
  bedroom: "/marketing/caring_hands_in_a_cozy_bedroom.png",
  bathroom: "/marketing/caring_moments_in_a_serene_bathroom.png",
  kitchen: "/marketing/caring_moments_in_a_cozy_kitchen.png",
  visit: "/marketing/caring_moments_in_a_cozy_home.png",
  dignityPrimary: "/marketing/caregiver_and_client_share_a_moment.png",
  dignitySecondary: "/marketing/caregiver_and_client_sharing_a_moment.png",
  team: "/marketing/caring_team_in_a_cozy_setting.png",
} as const;

const HERO_IMAGE_ALT =
  "Saintly Home Health aide warmly holding the hand of an older woman seated together on a sunlit couch at home";

const TRUST_PILLS = [
  "Personal Care Support",
  "Meal Assistance",
  "Light Housekeeping",
  "Safe Mobility",
  "Companionship",
] as const;

const SERVICE_CARDS = [
  {
    title: "Bathing and personal hygiene",
    body: "Respectful, gentle help with bathing, oral care, and grooming — at the patient's pace.",
    icon: Bath,
  },
  {
    title: "Dressing and grooming support",
    body: "A familiar hand for getting dressed, brushing hair, and feeling ready for the day.",
    icon: Shirt,
  },
  {
    title: "Meal setup and light nutrition support",
    body: "Helping prepare simple meals, set the table, and offer reminders within the care plan.",
    icon: UtensilsCrossed,
  },
  {
    title: "Light housekeeping and laundry",
    body: "Tidying patient spaces, fresh linens, and laundry tied to daily comfort and care.",
    icon: Sparkles,
  },
  {
    title: "Safe walking and transfers",
    body: "Steady support with standing, walking, and moving safely between rooms.",
    icon: Footprints,
  },
  {
    title: "Companionship and conversation",
    body: "A warm, friendly presence that helps the day feel calmer and less lonely.",
    icon: Heart,
  },
] as const;

const PHOTO_CARDS = [
  {
    eyebrow: "A clean, comfortable space",
    title: "Calm, tidy spaces at home",
    body: "Fresh linens, light tidying, and a comfortable setting that makes home feel restful again.",
    image: IMG.bedroom,
    alt: "Saintly aide gently smoothing fresh sheets across a soft, neatly made bed in a sunlit bedroom",
  },
  {
    eyebrow: "Personal care with dignity",
    title: "Personal care with dignity",
    body: "Patient, respectful support with bathing and grooming — helping each day start with confidence.",
    image: IMG.bathroom,
    alt: "Saintly aide helping an older woman dry her arm with a soft towel in a serene, bright bathroom",
  },
  {
    eyebrow: "Meal support at home",
    title: "Meal support at home",
    body: "Help with simple meals at the kitchen table — a small routine that makes a big difference.",
    image: IMG.kitchen,
    alt: "Saintly aide sharing a warm moment with an older woman over a healthy plated meal at the kitchen table",
  },
] as const;

const VISIT_INCLUDES = [
  "Help with bathing, dressing, and grooming",
  "Meal setup and reminders within the care plan",
  "Light housekeeping related to patient care",
  "Safe mobility and transfer support",
  "Comfort, companionship, and observation",
  "Updates to the care team when needed",
] as const;

const COVERAGE_BULLETS = [
  "Physician order required",
  "Must meet home health eligibility",
  "Usually connected to skilled nursing or therapy needs",
  "Services must be part of the care plan",
  "Coverage depends on Medicare criteria",
] as const;

const PROCESS_STEPS = [
  {
    title: "Call or Send Referral",
    body: "Reach our Tempe-based team. We listen, answer questions, and explain the next steps in plain language.",
    icon: PhoneCall,
  },
  {
    title: "We Confirm Orders & Coverage",
    body: "We help obtain the physician order, confirm home health eligibility, and gather documentation.",
    icon: Stethoscope,
  },
  {
    title: "Aide Support Begins at Home",
    body: "A trained aide visits the patient and supports the daily routines on the plan of care.",
    icon: CalendarCheck,
  },
] as const;

const FAQS = [
  {
    q: "Is a home health aide covered by Medicare?",
    a: "Medicare may cover home health aide services when they are part of an eligible home health plan of care and the patient also needs skilled services ordered by a physician. Coverage is determined by Medicare based on the individual's situation.",
  },
  {
    q: "What can a home health aide help with?",
    a: "An aide can help with bathing, dressing, grooming, meal setup, light housekeeping tied to patient care, safe mobility and transfers, and companionship — all within the patient's care plan.",
  },
  {
    q: "Is this the same as private caregiving?",
    a: "Not quite. Home health aide services through Saintly are part of a Medicare-certified home health plan of care and are tied to skilled nursing or therapy needs. Private-pay caregiving is a separate, broader service.",
  },
  {
    q: "Do I need a doctor's order?",
    a: "Yes. Home health aide services through home health require a physician/provider order and a face-to-face encounter that confirms the patient meets home health criteria.",
  },
  {
    q: "Do you serve Greater Phoenix?",
    a: "Yes. Saintly Home Health is based in Tempe and serves communities across the Greater Phoenix area. If you're unsure whether we serve your address, give us a call.",
  },
] as const;

export function MarketingHomeHealthAidePage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_HOME_HEALTH_AIDE_PAGE} />

      {/* ─── Hero — premium cream/gold panel, gold CTA ────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="hha-hero-heading"
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
              <SectionEyebrow>Home Health Aide · Saintly Home Health</SectionEyebrow>
            </div>

            <h1
              id="hha-hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)] xl:text-[clamp(4.85rem,5.2vw,7.25rem)]"
              style={{ color: NAVY }}
            >
              Home Health Aide Support at Home
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              Compassionate help with daily routines, personal care, mobility, meals, and comfort —
              right where patients feel safest.
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

            <div className="absolute -bottom-6 left-4 hidden items-center gap-3 rounded-2xl border border-white/90 bg-white/95 px-5 py-4 shadow-[0_24px_56px_-22px_rgba(15,23,42,0.30)] backdrop-blur-sm sm:flex lg:left-8 lg:-bottom-10">
              <span
                className="pointer-events-none absolute -inset-3 -z-10 rounded-3xl bg-[#FFC72C]/22 blur-2xl"
                aria-hidden
              />
              <GoldIconTile size="md">
                <HandHeart className="h-7 w-7" strokeWidth={1.9} aria-hidden />
              </GoldIconTile>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Trained Home Aides
                </p>
                <p className="truncate text-[15px] font-semibold leading-snug" style={{ color: NAVY }}>
                  Medicare Certified · AZ Licensed
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Curved veil into Intro section */}
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

      {/* ─── Intro — premium split image+text panel ───────────────────────── */}
      <section
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 pb-[clamp(5.75rem,13vw,8.75rem)] pt-[clamp(2rem,6vw,3.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="hha-intro-heading"
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
            {/* Copy */}
            <div className="relative flex min-w-0 flex-col justify-center gap-6 px-7 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div>
                <HaloMark className="mb-4 block" width={92} height={28} />
                <SectionEyebrow>Everyday support</SectionEyebrow>
                <h2
                  id="hha-intro-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Everyday care that helps patients feel comfortable and supported
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Our home health aides help patients with the daily routines that make home feel
                  safer, calmer, and more manageable.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                {[
                  "Warm, familiar faces",
                  "Care plan-driven visits",
                  "Help with daily routines",
                  "Family kept informed",
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

            {/* Image */}
            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[440px] lg:rounded-r-[2.5rem]">
              <Image
                src={IMG.intro}
                alt="Saintly aide unpacking fresh groceries with an older woman in a bright, warm kitchen"
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
                className="pointer-events-none absolute inset-0 bg-gradient-to-l from-transparent to-white/0 lg:to-[#fffaf0]/35"
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

      {/* ─── Services / support cards ─────────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="hha-services-heading"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-full max-w-[1700px] -translate-x-1/2 rounded-full bg-[#FFC72C]/12 blur-[150px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>What an aide can help with</SectionEyebrow>
          <h2
            id="hha-services-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            How a home health aide can help
          </h2>
        </div>

        <ul className="relative mx-auto mt-16 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {SERVICE_CARDS.map(({ title, body, icon: Icon }) => (
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

      {/* ─── Photo-rich routines section ──────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="hha-routines-heading"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-full max-w-[1700px] -translate-x-1/2 rounded-full bg-[#FFC72C]/12 blur-[150px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <HaloMark className="mx-auto mb-3 block" width={88} height={28} />
          <SectionEyebrow>Care that fits the day</SectionEyebrow>
          <h2
            id="hha-routines-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[clamp(2.25rem,4vw,3.75rem)] md:text-[clamp(2.5rem,3.5vw,4rem)]"
            style={{ color: NAVY }}
          >
            Support with the routines that matter most
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.6] text-slate-600 sm:text-[1.28rem]">
            From a clean, comfortable bedroom to gentle help in the bathroom and a warm meal at the
            kitchen table — the small routines add up to a calmer day.
          </p>
        </div>

        <ul className="relative mx-auto mt-16 grid min-w-0 max-w-[84rem] gap-7 sm:gap-8 lg:grid-cols-3">
          {PHOTO_CARDS.map(({ eyebrow, title, body, image, alt }) => (
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
                  <span className="absolute bottom-3 left-4 inline-flex max-w-[calc(100%-2rem)] rounded-full border border-white/90 bg-white/90 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-amber-800 shadow-sm backdrop-blur-sm">
                    {eyebrow}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-3 px-7 py-7 sm:px-8 sm:py-8">
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

      {/* ─── Companionship / dignity — wide rounded card ──────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="hha-dignity-heading"
        style={{ background: BG_CREAM_GOLD }}
      >
        <div
          className="relative mx-auto max-w-[84rem] overflow-hidden rounded-[2.25rem] border border-amber-100/80 shadow-[0_54px_120px_-44px_rgba(15,23,42,0.30)] md:rounded-[2.5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#FFC72C]/[0.20] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 items-stretch gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            {/* Image collage */}
            <div className="relative px-5 pt-9 pb-2 sm:px-9 sm:pt-12 lg:px-12 lg:py-12">
              <div className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.85rem] bg-amber-50 shadow-[0_44px_100px_-40px_rgba(15,23,42,0.32)] ring-1 ring-white/85 sm:aspect-[5/4] md:rounded-[2rem] lg:aspect-[4/5]">
                  <Image
                    src={IMG.dignityPrimary}
                    alt="Saintly aide sharing a quiet moment with an older woman over a warm cup of tea on a cozy couch"
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
                      src={IMG.dignitySecondary}
                      alt="Saintly aide steadily supporting an older woman as she walks safely with her walker through a sunlit room"
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

            {/* Copy */}
            <div className="relative flex min-w-0 flex-col justify-center gap-7 px-7 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div>
                <HaloMark className="mb-4 block" width={92} height={28} />
                <SectionEyebrow>Trust &amp; dignity</SectionEyebrow>
                <h2
                  id="hha-dignity-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Care that protects dignity and builds trust
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  The right aide can make daily care feel less stressful by offering calm support,
                  respectful help, and a familiar face at home.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                {[
                  "Calm, patient support",
                  "Respectful personal care",
                  "Familiar, friendly faces",
                  "Comfort first, always",
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

      {/* ─── What an aide visit can include — image+checklist panel ───────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="hha-visit-include-heading"
        style={{ background: BG_CREAM_SOFT }}
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

          <div className="relative grid min-w-0 items-stretch gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Image */}
            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[480px] lg:rounded-l-[2.5rem]">
              <Image
                src={IMG.visit}
                alt="Saintly aide gently folding fresh towels with an older woman on a sunlit, comfortable couch at home"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                quality={92}
                className="object-cover object-center"
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

            {/* Copy + checklist */}
            <div className="relative flex min-w-0 flex-col justify-center gap-7 px-7 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
              <div>
                <HaloMark className="mb-4 block" width={92} height={28} />
                <SectionEyebrow>During an aide visit</SectionEyebrow>
                <h2
                  id="hha-visit-include-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  What an aide visit can include
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Practical, plan-of-care-driven help with the daily routines that make home feel
                  comfortable and safe.
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

      {/* ─── Trust banner — care team ────────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 pb-[clamp(5.75rem,13vw,8.75rem)] pt-[clamp(4rem,10vw,7rem)] sm:px-7 lg:px-10"
        aria-labelledby="hha-team-heading"
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
                src={IMG.team}
                alt="Saintly Home Health team of clinicians smiling together in a warm, welcoming home setting"
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
                  id="hha-team-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Trusted support from the Saintly care team
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Our team coordinates care so families feel informed and patients feel supported at
                  home.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                {[
                  "Medicare-certified team",
                  "Tempe-based, Arizona-wide",
                  "Coordinated with your doctor",
                  "Live updates for families",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <GoldIconTile size="sm">
                      <Users className="h-5 w-5" strokeWidth={2.25} />
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
        aria-labelledby="hha-coverage-heading"
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
                id="hha-coverage-heading"
                className="mt-5 text-balance text-[clamp(1.95rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.1rem,3.5vw,3.35rem)] lg:text-[clamp(2.25rem,3.2vw,3.65rem)]"
                style={{ color: NAVY }}
              >
                Medicare May Cover Home Health Aide Services
              </h2>
              <p className="mt-7 text-[1.22rem] leading-[1.7] text-slate-800 sm:text-[1.32rem] sm:leading-[1.72]">
                Medicare may cover home health aide services when they are part of an eligible home
                health plan of care and the patient also needs skilled services ordered by a
                physician. Saintly Home Health helps coordinate the referral, orders, and
                documentation so the process is smoother for patients and families.
              </p>
              <div className="mt-8 inline-flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-white/90 px-5 py-4 text-[1.02rem] leading-[1.55] text-slate-700 shadow-[0_18px_40px_-22px_rgba(245,180,0,0.45)] ring-1 ring-amber-100/70 backdrop-blur-sm sm:text-[1.08rem]">
                <Sparkles
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>
                  Coverage is determined by Medicare based on each patient's situation and the home
                  health plan of care. We'll help you understand what may apply.
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
        aria-labelledby="hha-process-heading"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2
            id="hha-process-heading"
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
        aria-labelledby="hha-faq-heading"
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
            id="hha-faq-heading"
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
        aria-labelledby="hha-final-cta-heading"
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
              id="hha-final-cta-heading"
              className="text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[clamp(2.35rem,4vw,3.85rem)] lg:text-[clamp(2.5rem,3.5vw,4.25rem)]"
            >
              Need home health aide support?
            </h2>
            <p className="mt-7 max-w-2xl text-[1.3rem] leading-[1.68] text-amber-50/90 sm:text-[1.42rem] sm:leading-[1.7]">
              Call Saintly Home Health and we'll help confirm your referral, coverage, and next
              steps.
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
