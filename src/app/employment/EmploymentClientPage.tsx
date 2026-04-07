"use client";

import Link from "next/link";
import { useState } from "react";

import { MarketingFinalCtaStrip } from "@/components/marketing/MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "@/components/marketing/MarketingSiteFooter";
import { MarketingSiteHeader } from "@/components/marketing/MarketingSiteHeader";
import { MarketingStickyMobileCta } from "@/components/marketing/MarketingStickyMobileCta";
import { MARKETING_NAV_EMPLOYMENT_PAGE } from "@/components/marketing/marketing-nav";
import { SMS_CONSENT_CHECKBOX_LABEL, SMS_CONSENT_PURCHASE_NOTE } from "@/lib/marketing/sms-consent-copy";
import "@/components/marketing/marketing-home.css";

const CLINICAL = [
  "Active RN / PT / OT / ST license (as applicable to your role)",
  "CPR certification",
  "TB test (current)",
  "Valid driver’s license",
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

function RequirementCard({
  title,
  items,
  accentClass,
}: {
  title: string;
  items: readonly string[];
  accentClass: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-200/50">
      <div className={`mb-3 inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${accentClass}`}>
        {title}
      </div>
      <ul className="space-y-2.5 text-sm leading-snug text-slate-700">
        {items.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmploymentClientPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [smsConsent, setSmsConsent] = useState(false);

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
          sms_consent: true,
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
    if (!smsConsent) {
      setMessage("Please check the SMS consent box to submit your application.");
      return;
    }
    void submitApplication();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div id="top" className="shh-home-page">
        <MarketingSiteHeader navLinks={MARKETING_NAV_EMPLOYMENT_PAGE} />

        <section className="shh-hero shh-hero--page" aria-labelledby="employment-hero-heading">
          <div className="shh-hero-inner shh-hero-inner--single">
            <div className="shh-hero-heading">
              <div className="shh-pill">
                <span aria-hidden>✧</span>
                Careers · Greater Phoenix
              </div>
              <h1 id="employment-hero-heading">Work with Saintly Home Health</h1>
              <p className="shh-hero-sub">
                We hire clinicians and caregivers who align with our standards for safety, documentation, and
                respectful in-home care. Review the requirements below, then submit a short application—our team
                reviews every submission.
              </p>
            </div>
          </div>
        </section>

        <section className="shh-section" aria-labelledby="req-heading">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Before you apply</div>
            <h2 className="shh-section-title" id="req-heading">
              Requirements to Work With Saintly
            </h2>
            <p className="shh-section-text max-w-[52rem]">
              These expectations help us keep patients safe and teams aligned. They reflect what we verify during
              onboarding—not a complete job description.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RequirementCard title="Clinical requirements" items={CLINICAL} accentClass="bg-sky-50 text-sky-900" />
            <RequirementCard
              title="Compliance requirements"
              items={COMPLIANCE}
              accentClass="bg-violet-50 text-violet-900"
            />
            <RequirementCard
              title="Work expectations"
              items={WORK}
              accentClass="bg-teal-50 text-teal-900"
            />
          </div>
        </section>

        <section className="shh-section" id="apply" aria-labelledby="apply-heading">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Application</div>
            <h2 className="shh-section-title" id="apply-heading">
              Tell us about yourself
            </h2>
            <p className="shh-section-text max-w-[40rem]">
              A few focused steps—no account required. We use this information to qualify fit and follow up by
              phone or email; we do not use it to create an employee record until you complete a formal hiring
              process with our team.
            </p>
            <p className="mx-auto mt-4 max-w-[40rem] text-center text-xs leading-relaxed text-slate-600">
              By submitting this application, you agree to our{" "}
              <a className="font-semibold text-sky-800 underline-offset-2 hover:underline" href="/privacy">
                Privacy Policy
              </a>{" "}
              and{" "}
              <a className="font-semibold text-sky-800 underline-offset-2 hover:underline" href="/terms">
                Terms of Service
              </a>
              .
            </p>
          </div>

          <div className="mx-auto max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {step < 4 ? (
              <div className="mb-6 flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                <span>
                  Step {step} of 3
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {step === 1 ? "Contact" : step === 2 ? "Location & role" : "Experience"}
                </span>
              </div>
            ) : null}

            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Step 1: Personal information</h3>
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
                <div className="shh-form-actions">
                  <button type="button" className="shh-btn-primary shh-btn-primary--form" onClick={handleStep1Next}>
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Step 2: Location &amp; role</h3>
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
                <h3 className="text-lg font-semibold text-slate-900">Step 3: License &amp; experience</h3>
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
                    placeholder="Briefly highlight your background, settings you’ve worked in, and what you’re looking for in your next role."
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
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="shh-btn-secondary" onClick={() => setStep(2)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="shh-btn-primary shh-btn-primary--form"
                    onClick={handleStep3Submit}
                    disabled={loading || !smsConsent}
                  >
                    {loading ? "Submitting…" : "Submit application"}
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3 text-center">
                <h3 className="text-lg font-semibold text-slate-900">Thank you</h3>
                <p className="text-sm leading-relaxed text-slate-700">
                  Your application was received. Our recruiting team will review your information and reach out if
                  there is a match. We appreciate your interest in Saintly Home Health.
                </p>
                <Link href="/" className="inline-flex mt-2 text-sm font-semibold text-sky-800 underline-offset-2 hover:underline">
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
      </div>

      <MarketingStickyMobileCta />
    </div>
  );
}
