import Image from "next/image";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileSignature,
  HomeIcon,
  Info,
  Mail,
  PhoneCall,
  Phone,
  Printer,
  ShieldCheck,
  Sparkles,
  Stethoscope,
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
import { MARKETING_NAV_MEDICARE_PAGE } from "./marketing-nav";

const IMG = {
  hero: "/marketing/caring_healthcare_at_home_setting.png",
  intro: "/marketing/home_healthcare_consultation_in_cozy_setting.png",
} as const;

const HERO_IMAGE_ALT =
  "Saintly Home Health nurse explaining Medicare home health coverage to a patient at home";

const TRUST_PILLS = [
  "Medicare-Certified",
  "AHCCCS Provider",
  "Plain-Language Help",
  "Greater Phoenix",
] as const;

const REQUIREMENTS = [
  {
    title: "Physician orders",
    body: "A doctor must order home health services and stay involved in the plan of care.",
    icon: ClipboardList,
  },
  {
    title: "Medical necessity",
    body: "Care must be medically necessary — skilled nursing or therapy, not long-term custodial care.",
    icon: Stethoscope,
  },
  {
    title: "Homebound status",
    body: "The patient must meet Medicare's homebound criteria: leaving home requires considerable effort.",
    icon: HomeIcon,
  },
  {
    title: "Skilled need",
    body: "Skilled nursing, physical therapy, occupational therapy, or speech therapy ordered as needed.",
    icon: ShieldCheck,
  },
  {
    title: "Approved plan of care",
    body: "An individualized plan of care signed by the physician, reviewed regularly.",
    icon: FileSignature,
  },
  {
    title: "Face-to-face encounter",
    body: "A qualifying visit with the certifying provider that documents the need for home health.",
    icon: CalendarCheck,
  },
] as const;

const PLAN_NOTES = [
  {
    title: "Original Medicare (Part A / Part B)",
    body:
      "When eligibility criteria are met, Medicare may cover approved home health visits at 100% — no copay for covered services.",
  },
  {
    title: "Medicare Supplement (Medigap)",
    body:
      "Many supplements help with any costs that Original Medicare does not cover, which can mean little to no out-of-pocket cost for covered care.",
  },
  {
    title: "Medicare Advantage (Part C)",
    body:
      "Coverage rules and provider networks vary by plan. We'll help review your plan and explain what we can accept today.",
  },
  {
    title: "AHCCCS (Arizona Medicaid)",
    body:
      "Saintly Home Health is an AHCCCS provider for qualifying patients — call us and we'll help confirm eligibility.",
  },
] as const;

const FAQS = [
  {
    q: "Does Medicare always cover home health?",
    a: "Not always. Medicare may cover home health when care is medically necessary, ordered by a physician, and the patient meets home health eligibility requirements (including homebound status and a skilled need). Coverage is determined by Medicare based on the individual's situation.",
  },
  {
    q: "Will I have a copay?",
    a: "For Original Medicare patients who meet home health requirements, approved home health visits are typically covered at 100% with no copay for covered services. Costs may apply for items outside the home health benefit (for example, durable medical equipment may have separate cost sharing).",
  },
  {
    q: "What does \"homebound\" mean?",
    a: "Homebound generally means leaving home requires a considerable and taxing effort, typically with the help of supportive devices, special transportation, or another person. Patients can still leave home occasionally for medical care, religious services, or short events.",
  },
  {
    q: "Do I need a doctor's order to start home health?",
    a: "Yes. Medicare home health requires a physician/provider order and a face-to-face encounter that documents the need for skilled care at home. Saintly Home Health can help coordinate this with your provider.",
  },
  {
    q: "Can Saintly help me confirm what my plan covers?",
    a: "Yes — call our intake team in Tempe and we'll walk you through the basics of how Medicare home health coverage works, what your plan may allow, and the next steps in plain language.",
  },
] as const;

export function MarketingMedicarePage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_MEDICARE_PAGE} />

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="mc-hero-heading"
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
              <SectionEyebrow>Medicare &amp; Coverage</SectionEyebrow>
            </div>

            <h1
              id="mc-hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)]"
              style={{ color: NAVY }}
            >
              Medicare home health, explained simply
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              Medicare may cover home health services when care is medically necessary, ordered
              by a physician, and home health eligibility requirements are met.
            </p>
            <p className="mt-5 max-w-[36rem] text-[1.05rem] leading-[1.6] text-slate-600 sm:text-[1.15rem]">
              We'll explain how it works and help you understand what to expect — no pressure,
              just clear answers.
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
              <a href="/contact#form" className={BTN_DARK_OUTLINE}>
                Talk to Intake
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
                <ShieldCheck className="h-7 w-7" strokeWidth={1.9} aria-hidden />
              </GoldIconTile>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Medicare-Certified
                </p>
                <p className="truncate text-[15px] font-semibold leading-snug" style={{ color: NAVY }}>
                  Eligibility help, plain language
                </p>
              </div>
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

      {/* ─── Plain-language safe disclaimer card ─────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 pb-[clamp(3rem,8vw,5rem)] pt-[clamp(2rem,5vw,3.25rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="mc-disclaimer-heading"
      >
        <div className="mx-auto flex w-full max-w-[60rem] items-start gap-4 rounded-3xl border border-amber-100/80 bg-white/95 px-7 py-6 shadow-[0_24px_60px_-26px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/40 sm:gap-5 sm:px-9 sm:py-7">
          <Info className="mt-1 h-6 w-6 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
          <div className="min-w-0">
            <h2
              id="mc-disclaimer-heading"
              className="text-[1.05rem] font-semibold leading-[1.4] sm:text-[1.12rem]"
              style={{ color: NAVY }}
            >
              How Medicare home health coverage works
            </h2>
            <p className="mt-2 text-[1rem] leading-[1.6] text-slate-700 sm:text-[1.05rem]">
              Coverage is determined by Medicare based on the individual&apos;s situation. The
              information on this page is general and educational. We do not promise guaranteed
              coverage or $0 cost for everyone — call us and we&apos;ll explain in plain language.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 6 requirement cards ─────────────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="mc-requirements-heading"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-full max-w-[1700px] -translate-x-1/2 rounded-full bg-[#FFC72C]/12 blur-[150px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>What Medicare looks at</SectionEyebrow>
          <h2
            id="mc-requirements-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Common requirements for home health coverage
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Medicare reviews each situation individually. These are the most common factors
            patients and families ask us about.
          </p>
        </div>

        <ul className="relative mx-auto mt-16 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {REQUIREMENTS.map(({ title, body, icon: Icon }) => (
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

      {/* ─── Image + text panel: We help you navigate ────────────────────── */}
      <section
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="mc-help-heading"
      >
        <div
          className="relative mx-auto max-w-[84rem] overflow-hidden rounded-[2.25rem] border border-amber-100/80 shadow-[0_54px_120px_-44px_rgba(15,23,42,0.30)] md:rounded-[2.5rem]"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#FFC72C]/[0.20] blur-[110px]"
            aria-hidden
          />

          <div className="relative grid min-w-0 items-stretch gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[440px] lg:rounded-l-[2.5rem]">
              <Image
                src={IMG.intro}
                alt="Saintly intake nurse explaining home health benefits to a family at the kitchen table"
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
                <SectionEyebrow>What Saintly helps with</SectionEyebrow>
                <h2
                  id="mc-help-heading"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  We help you understand your coverage
                </h2>
                <p className="mt-6 text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.28rem]">
                  Our intake team will review your situation, explain how Medicare home health
                  coverage works for your plan, and coordinate with your physician for the
                  documentation Medicare requires.
                </p>
              </div>
              <ul className="grid gap-3 sm:gap-4">
                {[
                  "Confirm whether home health is appropriate for the patient",
                  "Coordinate physician orders and the face-to-face encounter",
                  "Walk through what a plan of care includes",
                  "Explain what to expect from a typical home health episode",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <GoldIconTile size="sm">
                      <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                    </GoldIconTile>
                    <span className="pt-1.5 text-[1.05rem] font-semibold leading-[1.5] text-[#0c1929] sm:text-[1.1rem]">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Plan notes ─────────────────────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="mc-plans-heading"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Plans &amp; coverage types</SectionEyebrow>
          <h2
            id="mc-plans-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            How different plans typically work
          </h2>
        </div>

        <ul className="relative mx-auto mt-14 grid min-w-0 max-w-[80rem] gap-6 sm:grid-cols-2 sm:gap-7">
          {PLAN_NOTES.map((plan) => (
            <li key={plan.title} className="group h-full">
              <article className="relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                <GoldIconTile size="sm">
                  <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
                </GoldIconTile>
                <h3
                  className="text-[1.32rem] font-semibold leading-[1.25] tracking-[-0.01em] sm:text-[1.4rem]"
                  style={{ color: NAVY }}
                >
                  {plan.title}
                </h3>
                <p className="text-[1.08rem] leading-[1.65] text-slate-700">{plan.body}</p>
              </article>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-10 flex w-full max-w-[60rem] items-start gap-4 rounded-3xl border border-amber-100/80 bg-white/95 px-7 py-6 shadow-[0_24px_60px_-26px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/40 sm:gap-5 sm:px-9 sm:py-7">
          <Sparkles className="mt-1 h-6 w-6 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
          <div className="min-w-0">
            <p className="text-[1.05rem] font-semibold leading-[1.4] sm:text-[1.12rem]" style={{ color: NAVY }}>
              Not sure what your plan covers?
            </p>
            <p className="mt-2 text-[1rem] leading-[1.6] text-slate-700 sm:text-[1.05rem]">
              Call our intake team — we&apos;ll review what your plan typically allows and what we
              can accept today.
            </p>
          </div>
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,12.5vw,8.5rem)] sm:px-7 lg:px-10"
        aria-labelledby="mc-faq-heading"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2
            id="mc-faq-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Common Medicare questions
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

      {/* ─── Final CTA ────────────────────────────────────────────────────── */}
      <section
        className="relative mx-4 my-16 overflow-x-hidden rounded-[2rem] px-7 py-[4.5rem] text-white shadow-[0_60px_128px_-46px_rgba(15,23,42,0.58)] ring-1 ring-amber-200/15 sm:mx-6 sm:px-10 sm:py-[5rem] md:mx-auto md:max-w-[86rem] md:px-16 md:py-[5.25rem] lg:my-24 lg:px-20 lg:py-[5.75rem]"
        aria-labelledby="mc-final-cta-heading"
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
              Talk to a real person
            </p>
            <h2
              id="mc-final-cta-heading"
              className="text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[clamp(2.35rem,4vw,3.85rem)] lg:text-[clamp(2.5rem,3.5vw,4.25rem)]"
            >
              Have Medicare questions? We&apos;ll explain it in plain language.
            </h2>
            <p className="mt-7 max-w-2xl text-[1.3rem] leading-[1.68] text-amber-50/90 sm:text-[1.42rem] sm:leading-[1.7]">
              Call our intake team in Tempe and we&apos;ll review what your plan typically allows
              and what to expect.
            </p>
          </div>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8 lg:flex-col lg:items-stretch lg:gap-6 xl:flex-row xl:items-center xl:gap-10">
            <a href={TEL} className={BTN_GOLD}>
              <span
                className="pointer-events-none absolute -inset-2 -z-10 rounded-full bg-[#FFC72C]/40 blur-2xl"
                aria-hidden
              />
              <Phone className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              Call {PHONE_DISPLAY}
            </a>
            <a href="/contact#form" className={BTN_OUTLINE_ON_DARK}>
              Talk to Intake
              <span className="text-lg leading-none text-[#FFC72C]" aria-hidden>
                →
              </span>
            </a>
          </div>
        </div>

        <div className="relative mt-12 grid gap-4 border-t border-white/10 pt-9 sm:grid-cols-3 sm:gap-8">
          <a href={TEL} className="group flex items-center gap-3 text-amber-50/90 transition hover:text-white">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC72C]/15 text-[#FFC72C] ring-1 ring-[#FFC72C]/25 transition group-hover:bg-[#FFC72C]/25">
              <PhoneCall className="h-5 w-5" strokeWidth={2} aria-hidden />
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

      <MarketingStickyMobileCta secondaryHref="/contact#form" secondaryLabel="Talk to Intake" />
    </div>
  );
}
