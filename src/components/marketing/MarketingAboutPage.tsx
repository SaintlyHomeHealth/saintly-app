import Image from "next/image";
import { CheckCircle2, HeartHandshake, Phone, ShieldCheck, Stethoscope, Users2 } from "lucide-react";
import {
  ABOUT_WHO_WE_ARE,
  CLINICAL_GROUPS,
  LEADERSHIP,
  WHY_CHOOSE,
} from "./marketing-about-content";
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
import { MARKETING_NAV_ABOUT_PAGE } from "./marketing-nav";

const TRUST_PILLS = [
  "Medicare-Certified",
  "Tempe-Based",
  "Greater Phoenix",
  "Physician-Coordinated",
] as const;

const VALUE_BADGES = [
  { label: "Compassionate care", icon: HeartHandshake },
  { label: "Doctor-coordinated", icon: Stethoscope },
  { label: "Experienced clinicians", icon: ShieldCheck },
  { label: "Family-first communication", icon: Users2 },
] as const;

export function MarketingAboutPage() {
  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_ABOUT_PAGE} />

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="about-hero-heading"
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
              <SectionEyebrow>About Saintly Home Health</SectionEyebrow>
            </div>

            <h1
              id="about-hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)]"
              style={{ color: NAVY }}
            >
              Compassionate home health, led by experienced clinicians
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              Medicare-certified home health for Greater Phoenix — skilled care at home, clear
              communication, and a team that treats you like family.
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
                src="/marketing/healthcare_team_in_a_home_setting.png"
                alt="Saintly Home Health team smiling together in a warm, welcoming home setting"
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
                  Compassionate care, clinical excellence
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

      {/* ─── Story split panel ─────────────────────────────────────────── */}
      <section
        id="who-we-are"
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        style={{ backgroundColor: CREAM }}
        aria-labelledby="who-title"
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
                <SectionEyebrow>Who we are</SectionEyebrow>
                <h2
                  id="who-title"
                  className="mt-5 text-balance text-[clamp(2rem,3.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.028em] sm:text-[clamp(2.2rem,3.4vw,3.35rem)]"
                  style={{ color: NAVY }}
                >
                  Home health with heart — and high standards
                </h2>
              </div>
              <div className="space-y-5">
                {ABOUT_WHO_WE_ARE.map((p, i) => (
                  <p
                    key={i}
                    className="text-[1.18rem] leading-[1.7] text-slate-700 sm:text-[1.22rem]"
                  >
                    {p}
                  </p>
                ))}
              </div>
              <ul className="mt-2 grid gap-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                {VALUE_BADGES.map(({ label, icon: Icon }) => (
                  <li key={label} className="flex items-start gap-3">
                    <GoldIconTile size="sm">
                      <Icon className="h-5 w-5" strokeWidth={2.25} />
                    </GoldIconTile>
                    <span className="pt-1.5 text-[1.05rem] font-semibold leading-[1.5] text-[#0c1929] sm:text-[1.1rem]">
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative aspect-[16/11] min-w-0 w-full overflow-hidden bg-amber-50 lg:aspect-auto lg:min-h-[440px] lg:rounded-r-[2.5rem]">
              <Image
                src="/marketing/cozy_embrace_in_a_sunlit_living_room.png"
                alt="A cozy embrace in a sunlit living room — Saintly cares for patients where they feel most comfortable"
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

      {/* ─── Leadership ─────────────────────────────────────────────────── */}
      <section
        id="leadership"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="leadership-title"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Leadership</SectionEyebrow>
          <h2
            id="leadership-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Experienced oversight you can trust
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Short introductions — our full team works together to keep care safe, timely, and
            respectful.
          </p>
        </div>

        <ul className="relative mx-auto mt-16 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {LEADERSHIP.map((person) => (
            <li key={`${person.name}-${person.title}`} className="group h-full">
              <article className="relative flex h-full flex-col gap-4 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                <span
                  className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFC72C]/20 blur-2xl"
                  aria-hidden
                />
                <GoldIconTile size="md">
                  <Users2 className="h-7 w-7" strokeWidth={1.9} />
                </GoldIconTile>
                <div>
                  <h3
                    className="text-[1.32rem] font-semibold leading-[1.2] tracking-[-0.01em] sm:text-[1.4rem]"
                    style={{ color: NAVY }}
                  >
                    {person.name}
                  </h3>
                  <p className="mt-1 text-[14px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    {person.title}
                  </p>
                </div>
                <p className="text-[1.05rem] leading-[1.62] text-slate-700">{person.summary}</p>
                {person.credentials ? (
                  <p className="mt-auto pt-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {person.credentials}
                  </p>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Clinical team ─────────────────────────────────────────────── */}
      <section
        id="clinical-team"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="clinical-title"
        style={{ backgroundColor: CREAM }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Clinical team</SectionEyebrow>
          <h2
            id="clinical-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Who you may meet
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            Your plan may include one or more disciplines — always ordered by your physician.
          </p>
        </div>

        <ul className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-2 lg:gap-8">
          {CLINICAL_GROUPS.map((g) => (
            <li key={g.title} className="group h-full">
              <article className="relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 sm:p-9">
                <div className="flex items-center gap-4">
                  <GoldIconTile size="md">
                    <Stethoscope className="h-7 w-7" strokeWidth={1.9} />
                  </GoldIconTile>
                  <h3
                    className="text-[1.32rem] font-semibold leading-tight tracking-[-0.01em] sm:text-[1.4rem]"
                    style={{ color: NAVY }}
                  >
                    {g.title}
                  </h3>
                </div>
                <ul className="space-y-3">
                  {g.lines.map((line, i) => (
                    <li key={i} className="flex items-start gap-3 text-[1.05rem] leading-[1.6] text-slate-700">
                      <CheckCircle2
                        className="mt-1 h-5 w-5 shrink-0 text-amber-600"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Why families choose Saintly ────────────────────────────────── */}
      <section
        id="why-saintly"
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="why-title"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Why Saintly</SectionEyebrow>
          <h2
            id="why-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            What families tell us matters most
          </h2>
        </div>

        <ul className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {WHY_CHOOSE.map((item) => (
            <li key={item.title} className="group h-full">
              <article className="relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
                <GoldIconTile size="sm">
                  <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
                </GoldIconTile>
                <h3
                  className="text-[1.22rem] font-semibold leading-[1.25] tracking-[-0.01em] sm:text-[1.3rem]"
                  style={{ color: NAVY }}
                >
                  {item.title}
                </h3>
                <p className="text-[1.05rem] leading-[1.62] text-slate-700">{item.body}</p>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <MarketingFinalCtaStrip />

      <MarketingSiteFooter />

      <MarketingStickyMobileCta />
    </div>
  );
}
