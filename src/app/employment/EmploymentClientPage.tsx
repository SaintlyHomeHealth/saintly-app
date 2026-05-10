"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  ClipboardList,
  HeartHandshake,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users2,
} from "lucide-react";

import { HaloMark } from "@/components/marketing/MarketingHaloMark";
import { MarketingFinalCtaStrip } from "@/components/marketing/MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "@/components/marketing/MarketingSiteFooter";
import { MarketingSiteHeader } from "@/components/marketing/MarketingSiteHeader";
import { MarketingStickyMobileCta } from "@/components/marketing/MarketingStickyMobileCta";
import { PHONE_DISPLAY, TEL } from "@/components/marketing/marketing-constants";
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
} from "@/components/marketing/marketing-design";
import { MARKETING_NAV_EMPLOYMENT_PAGE } from "@/components/marketing/marketing-nav";
import { SMS_CONSENT_CHECKBOX_LABEL, SMS_CONSENT_PURCHASE_NOTE } from "@/lib/marketing/sms-consent-copy";
import "@/components/marketing/marketing-home.css";

const TRUST_PILLS = [
  "Greater Phoenix",
  "Tempe-Based",
  "Compassionate Team",
  "Clinical Excellence",
] as const;

const CLINICAL = [
  "Active RN / PT / OT / ST license (as applicable to your role)",
  "CPR certification",
  "TB test (current)",
  "Valid driver's license",
  "Auto insurance",
] as const;

const COMPLIANCE = [
  "Background check",
  "Drug screening",
  "OIG exclusion check",
  "Skills competency",
  "Annual training",
] as const;

const WORK = [
  "OASIS documentation (for nurses)",
  "Reliable scheduling and communication",
  "Professional patient care",
  "Timely documentation",
] as const;

const ROLES_WE_HIRE = [
  {
    title: "Registered Nurses (RN)",
    body: "Skilled clinical care, OASIS documentation, and physician coordination at home.",
    icon: Stethoscope,
  },
  {
    title: "Physical / Occupational / Speech Therapists",
    body: "Therapy at home — strength, mobility, daily living, and communication.",
    icon: HeartHandshake,
  },
  {
    title: "Home Health Aides (HHA)",
    body: "Compassionate help with bathing, dressing, meals, and daily routines.",
    icon: Users2,
  },
  {
    title: "Marketing & Sales",
    body: "Build relationships with referral partners across Greater Phoenix.",
    icon: Sparkles,
  },
  {
    title: "Office & Operations",
    body: "Intake, scheduling, billing, and the back-office work that keeps care running.",
    icon: Briefcase,
  },
  {
    title: "Clinical Leadership",
    body: "Nursing leadership and oversight roles to support our growing team.",
    icon: ShieldCheck,
  },
] as const;

const WHY_SAINTLY = [
  {
    title: "Compassionate culture",
    body: "We treat patients, families, and each other with respect and care.",
    icon: HeartHandshake,
  },
  {
    title: "Clinical excellence",
    body: "High standards for safety, documentation, and patient outcomes.",
    icon: ShieldCheck,
  },
  {
    title: "Supportive team",
    body: "You're not alone in the field — leadership and office support backing you up.",
    icon: Users2,
  },
] as const;

function RequirementCard({
  title,
  items,
  Icon,
}: {
  title: string;
  items: readonly string[];
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <article className="relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-7 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-8">
      <span
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFC72C]/20 blur-2xl"
        aria-hidden
      />
      <div className="flex items-center gap-4">
        <GoldIconTile size="md">
          <Icon className="h-7 w-7" strokeWidth={1.9} />
        </GoldIconTile>
        <h3
          className="text-[1.2rem] font-semibold leading-tight tracking-[-0.01em] sm:text-[1.28rem]"
          style={{ color: NAVY }}
        >
          {title}
        </h3>
      </div>
      <ul className="space-y-3">
        {items.map((line) => (
          <li key={line} className="flex items-start gap-3 text-[1.02rem] leading-[1.55] text-slate-700">
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
  );
}

export function EmploymentClientPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [smsConsent, setSmsConsent] = useState(false);
  const [fbclid, setFbclid] = useState("");

  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("fbclid");
      if (v) setFbclid(v);
    } catch {
      /* ignore */
    }
  }, []);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    position: "",
    license_number: "",
    years_experience: "",
    preferred_hours: "",
    available_start_date: "",
    experience_message: "",
    resume_url: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const emailOk = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleStep1Next = () => {
    setMessage("");
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setMessage("Please complete your name, email, and phone.");
      return;
    }
    if (!emailOk(form.email)) {
      setMessage("Please enter a valid email address.");
      return;
    }
    if (!smsConsent) {
      setMessage("Please check the SMS consent box to continue.");
      return;
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    setMessage("");
    if (!form.position) {
      setMessage("Please select the role you are applying for.");
      return;
    }
    setStep(3);
  };

  const submitApplication = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/employment-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          sms_consent: smsConsent,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          position: form.position,
          license_number: form.license_number,
          years_experience: form.years_experience,
          preferred_hours: form.preferred_hours,
          available_start_date: form.available_start_date,
          experience_message: form.experience_message,
          resume_url: form.resume_url,
          ...(fbclid.trim() ? { fbclid: fbclid.trim() } : {}),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(
          data.error === "validation_phone"
            ? "Please enter a valid 10-digit U.S. phone number."
            : data.error === "sms_consent_required"
              ? "Please check the SMS consent box to submit your application."
              : "We could not submit your application. Please try again or call our office."
        );
        return;
      }
      setStep(4);
    } catch {
      setMessage("We could not submit your application. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleStep3Submit = () => {
    setMessage("");
    if (!form.position) {
      setMessage("Please select the role you are applying for.");
      return;
    }
    void submitApplication();
  };

  return (
    <div
      className="min-h-screen w-full min-w-0 overflow-x-hidden pb-32 text-[#0c1929] md:pb-0"
      style={{ backgroundColor: CREAM }}
    >
      <MarketingSiteHeader navLinks={MARKETING_NAV_EMPLOYMENT_PAGE} />

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        aria-labelledby="employment-hero-heading"
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
              <SectionEyebrow>Careers · Saintly Home Health</SectionEyebrow>
            </div>

            <h1
              id="employment-hero-heading"
              className="text-balance text-[clamp(3rem,6.5vw,4.5rem)] font-semibold leading-[1.0] tracking-[-0.04em] sm:text-[clamp(3.5rem,6.1vw,5.25rem)] md:text-[clamp(4rem,5.6vw,5.85rem)] lg:text-[clamp(4.25rem,5.4vw,6.25rem)]"
              style={{ color: NAVY }}
            >
              Work with Saintly Home Health
            </h1>

            <p className="mt-9 max-w-[36rem] text-[1.32rem] leading-[1.6] text-slate-700 sm:mt-11 sm:text-[1.42rem] sm:leading-[1.6] md:text-[1.55rem] md:leading-[1.6]">
              We hire clinicians and caregivers who align with our standards for safety,
              documentation, and respectful in-home care.
            </p>
            <p className="mt-5 max-w-[36rem] text-[1.05rem] leading-[1.6] text-slate-600 sm:text-[1.15rem]">
              Review the requirements below, then submit a short application — our team reviews
              every submission.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:mt-12 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
              <a href="#apply" className={BTN_GOLD}>
                <span
                  className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-0 rounded-full bg-[#FFC72C]/25 blur-[28px]"
                  aria-hidden
                />
                <span className="relative">Apply now</span>
              </a>
              <a href={TEL} className={BTN_DARK_OUTLINE}>
                <Phone className="h-[1.3rem] w-[1.3rem]" strokeWidth={2.25} aria-hidden />
                Call {PHONE_DISPLAY}
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

      {/* ─── Why Saintly ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="why-saintly-title"
        style={{ backgroundColor: CREAM }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Why Saintly</SectionEyebrow>
          <h2
            id="why-saintly-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            What makes Saintly different
          </h2>
        </div>

        <ul className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-3 sm:gap-7 lg:gap-8">
          {WHY_SAINTLY.map(({ title, body, icon: Icon }) => (
            <li key={title} className="group h-full">
              <article className="relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
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

      {/* ─── Roles we hire ─────────────────────────────────────────── */}
      <section
        id="roles"
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="roles-title"
        style={{ background: BG_CREAM_SOFT }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Roles we hire for</SectionEyebrow>
          <h2
            id="roles-title"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Open roles across our agency
          </h2>
        </div>

        <ul className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          {ROLES_WE_HIRE.map(({ title, body, icon: Icon }) => (
            <li key={title} className="group h-full">
              <article className="relative flex h-full flex-col gap-5 overflow-hidden rounded-[1.85rem] border border-amber-100/70 bg-white/95 p-8 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.22)] ring-1 ring-amber-100/40 transition duration-300 hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_40px_90px_-30px_rgba(245,180,0,0.32)] sm:p-9">
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

      {/* ─── What we look for / requirements ──────────────────────── */}
      <section
        className="relative overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="req-heading"
        style={{ backgroundColor: CREAM }}
      >
        <div className="relative mx-auto max-w-4xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Before you apply</SectionEyebrow>
          <h2
            id="req-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            What we look for
          </h2>
          <p className="mx-auto mt-6 max-w-[52rem] text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            These expectations help us keep patients safe and teams aligned. They reflect what we
            verify during onboarding — not a complete job description.
          </p>
        </div>

        <div className="relative mx-auto mt-14 grid min-w-0 max-w-[85rem] gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 lg:gap-8">
          <RequirementCard title="Clinical requirements" items={CLINICAL} Icon={Stethoscope} />
          <RequirementCard title="Compliance requirements" items={COMPLIANCE} Icon={ShieldCheck} />
          <RequirementCard title="Work expectations" items={WORK} Icon={ClipboardList} />
        </div>
      </section>

      {/* ─── Application form (preserve wizard logic) ─────────────────── */}
      <section
        id="apply"
        className="relative scroll-mt-[4.75rem] overflow-x-hidden px-5 py-[clamp(5.75rem,13vw,8.75rem)] sm:px-7 lg:px-10"
        aria-labelledby="apply-heading"
        style={{ background: BG_CREAM_COOL }}
      >
        <div className="relative mx-auto max-w-3xl text-center">
          <HaloMark className="mx-auto mb-4 block" width={88} height={28} />
          <SectionEyebrow>Application</SectionEyebrow>
          <h2
            id="apply-heading"
            className="mt-5 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY }}
          >
            Tell us about yourself
          </h2>
          <p className="mx-auto mt-6 max-w-[40rem] text-[1.18rem] leading-[1.65] text-slate-700 sm:text-[1.22rem]">
            A few focused steps — no account required. We use this information to qualify fit and
            follow up by phone or email.
          </p>
          <p className="mx-auto mt-4 max-w-[40rem] text-center text-[13px] leading-relaxed text-slate-600">
            By submitting this application, you agree to our{" "}
            <a className="font-semibold text-amber-700 underline-offset-2 hover:underline" href="/privacy">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a className="font-semibold text-amber-700 underline-offset-2 hover:underline" href="/terms">
              Terms of Service
            </a>
            .
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-xl rounded-[2rem] border border-amber-100/80 bg-white/95 p-6 shadow-[0_38px_90px_-32px_rgba(15,23,42,0.28)] ring-1 ring-amber-100/40 sm:p-8">
          {step < 4 ? (
            <div className="mb-6 flex items-center justify-between gap-2 text-[12px] font-medium text-slate-500">
              <span>Step {step} of 3</span>
              <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                {step === 1 ? "Contact" : step === 2 ? "Location & role" : "Experience"}
              </span>
            </div>
          ) : null}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-[1.1rem] font-semibold text-slate-900">Step 1: Personal information</h3>
              <div className="shh-field-row">
                <div className="shh-field">
                  <label htmlFor="emp-fn">First name</label>
                  <input
                    id="emp-fn"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    autoComplete="given-name"
                    required
                  />
                </div>
                <div className="shh-field">
                  <label htmlFor="emp-ln">Last name</label>
                  <input
                    id="emp-ln"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    autoComplete="family-name"
                    required
                  />
                </div>
              </div>
              <div className="shh-field">
                <label htmlFor="emp-em">Email</label>
                <input
                  id="emp-em"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="shh-field">
                <label htmlFor="emp-ph">Phone</label>
                <input
                  id="emp-ph"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="Best number to reach you"
                  required
                />
              </div>
              <div className="shh-sms-consent">
                <label htmlFor="emp-sms-consent" className="shh-sms-consent__label">
                  <input
                    id="emp-sms-consent"
                    name="sms_consent"
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="shh-sms-consent__input"
                  />
                  <span className="shh-sms-consent__text">{SMS_CONSENT_CHECKBOX_LABEL}</span>
                </label>
                <p className="shh-sms-consent__note">{SMS_CONSENT_PURCHASE_NOTE}</p>
              </div>
              <div className="shh-form-actions">
                <button
                  type="button"
                  className="shh-btn-primary shh-btn-primary--form"
                  onClick={handleStep1Next}
                  disabled={!smsConsent}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-[1.1rem] font-semibold text-slate-900">Step 2: Location &amp; role</h3>
              <div className="shh-field">
                <label htmlFor="emp-addr">Street address</label>
                <input
                  id="emp-addr"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  autoComplete="street-address"
                />
              </div>
              <div className="shh-field-row">
                <div className="shh-field">
                  <label htmlFor="emp-city">City</label>
                  <input id="emp-city" name="city" value={form.city} onChange={handleChange} autoComplete="address-level2" />
                </div>
                <div className="shh-field">
                  <label htmlFor="emp-st">State</label>
                  <input id="emp-st" name="state" value={form.state} onChange={handleChange} autoComplete="address-level1" />
                </div>
              </div>
              <div className="shh-field">
                <label htmlFor="emp-zip">ZIP</label>
                <input id="emp-zip" name="zip" value={form.zip} onChange={handleChange} autoComplete="postal-code" />
              </div>
              <div className="shh-field">
                <label htmlFor="emp-pos">Role you are pursuing</label>
                <select id="emp-pos" name="position" value={form.position} onChange={handleChange} required>
                  <option value="">Select role</option>
                  <option value="RN">RN</option>
                  <option value="LVN">LVN</option>
                  <option value="PT">PT</option>
                  <option value="OT">OT</option>
                  <option value="ST">ST / SLP</option>
                  <option value="HHA">HHA</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="shh-btn-secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" className="shh-btn-primary shh-btn-primary--form" onClick={handleStep2Next}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-[1.1rem] font-semibold text-slate-900">Step 3: License &amp; experience</h3>
              <div className="shh-field">
                <label htmlFor="emp-lic">License number (if applicable)</label>
                <input id="emp-lic" name="license_number" value={form.license_number} onChange={handleChange} />
              </div>
              <div className="shh-field-row">
                <div className="shh-field">
                  <label htmlFor="emp-yrs">Years of experience</label>
                  <input id="emp-yrs" name="years_experience" value={form.years_experience} onChange={handleChange} />
                </div>
                <div className="shh-field">
                  <label htmlFor="emp-start">Available start</label>
                  <input
                    id="emp-start"
                    name="available_start_date"
                    value={form.available_start_date}
                    onChange={handleChange}
                    placeholder="e.g. 2 weeks notice"
                  />
                </div>
              </div>
              <div className="shh-field">
                <label htmlFor="emp-hrs">Preferred hours</label>
                <input
                  id="emp-hrs"
                  name="preferred_hours"
                  value={form.preferred_hours}
                  onChange={handleChange}
                  placeholder="Full-time, part-time, PRN…"
                />
              </div>
              <div className="shh-field">
                <label htmlFor="emp-msg">Experience &amp; message</label>
                <textarea
                  id="emp-msg"
                  name="experience_message"
                  rows={5}
                  value={form.experience_message}
                  onChange={handleChange}
                  placeholder="Briefly highlight your background, settings you've worked in, and what you're looking for in your next role."
                />
              </div>
              <div className="shh-field">
                <label htmlFor="emp-resume">Resume link (optional)</label>
                <input
                  id="emp-resume"
                  name="resume_url"
                  type="url"
                  value={form.resume_url}
                  onChange={handleChange}
                  placeholder="https://…"
                />
                <p className="shh-form-hint">
                  If your resume is online (Google Drive, Dropbox, etc.), paste a link. We do not accept file
                  uploads on this form.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="shh-btn-secondary" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  type="button"
                  className="shh-btn-primary shh-btn-primary--form"
                  onClick={handleStep3Submit}
                  disabled={loading}
                >
                  {loading ? "Submitting…" : "Submit application"}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-center">
              <h3 className="text-[1.15rem] font-semibold text-slate-900">Thank you</h3>
              <p className="text-[15px] leading-relaxed text-slate-700">
                Your application was received. Our recruiting team will review your information and reach out if
                there is a match. We appreciate your interest in Saintly Home Health.
              </p>
              <Link
                href="/"
                className="mt-2 inline-flex text-[14px] font-semibold text-amber-700 underline-offset-2 hover:underline"
              >
                Return to home
              </Link>
            </div>
          )}

          {message ? (
            <p className="shh-form-notice mt-4" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </section>

      <MarketingFinalCtaStrip />

      <MarketingSiteFooter />

      <MarketingStickyMobileCta secondaryHref="#apply" secondaryLabel="Apply now" />
    </div>
  );
}
