import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import {
  EMAIL_INTAKE,
  FAX_DISPLAY,
  MAILTO_INTAKE,
  PHONE_DISPLAY,
  TEL,
} from "./marketing-constants";
import { MARKETING_NAV_REFERRALS_PAGE } from "./marketing-nav";
import "./marketing-home.css";

const PHONE_REFERRAL_LINE = "480-360-0008";

const MAILTO_REFERRAL = `${MAILTO_INTAKE}?subject=${encodeURIComponent("Referral — Saintly Home Health")}`;

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
  },
  {
    title: "Fast intake response",
    body: "We prioritize referral review and follow-up so transitions out of facilities stay smooth.",
  },
  {
    title: "Coordinated physician communication",
    body: "Orders, updates, and changes flow back to the referring provider without delay.",
  },
  {
    title: "Experienced clinical leadership",
    body: "Nurse-led oversight and disciplined field practice you can rely on for complex patients.",
  },
  {
    title: "Greater Phoenix coverage",
    body: "Tempe-based team serving Maricopa, Pinal, Gila, Yavapai, Pima, and surrounding areas.",
  },
  {
    title: "Compassionate, patient-centered care",
    body: "Clear plans, respectful visits, and families that know what to expect.",
  },
] as const;

const REFERRAL_STEPS = [
  { n: "Step 1", title: "Send referral", body: "Call, fax, or email clinical information and demographics." },
  { n: "Step 2", title: "We review eligibility and orders", body: "We confirm Medicare rules and work with the physician for compliant orders." },
  { n: "Step 3", title: "We coordinate intake and start of care", body: "Scheduling, first visit, and teaching—aligned with the plan of care." },
  { n: "Step 4", title: "We keep the referring provider updated", body: "Progress, barriers, and discharge planning flow back to your team." },
] as const;

export function MarketingReferralsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div id="top" className="shh-home-page">
        <MarketingSiteHeader navLinks={MARKETING_NAV_REFERRALS_PAGE} />

        <section className="shh-hero shh-hero--page" aria-labelledby="referrals-hero-heading">
          <div className="shh-hero-inner shh-hero-inner--single">
            <div className="shh-hero-heading">
              <div className="shh-pill">
                <span aria-hidden>✧</span>
                Partner referrals · Greater Phoenix
              </div>
              <h1 id="referrals-hero-heading">Refer patients to Saintly Home Health</h1>
              <p className="shh-hero-sub">
                We work with physicians, hospitals, case managers, discharge planners, and community partners
                to coordinate skilled home health services quickly and professionally across Greater Phoenix.
              </p>
              <div className="shh-hero-cta">
                <a className="shh-btn-primary" href={TEL}>
                  Call intake
                </a>
                <a className="shh-btn-secondary" href="#referral-contact">
                  Fax referral
                </a>
                <a className="shh-btn-secondary" href="/contact#form">
                  Contact our team
                </a>
                <p className="shh-hero-cta-note shh-hero-cta-note--compact">
                  <span className="block sm:inline">Phone: {PHONE_REFERRAL_LINE}</span>
                  <span className="hidden sm:inline"> · </span>
                  <span className="block sm:inline">Fax: {FAX_DISPLAY}</span>
                  <span className="hidden sm:inline"> · </span>
                  <span className="block sm:inline">{EMAIL_INTAKE}</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="shh-section" id="partners" aria-labelledby="partners-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Partners</div>
            <h2 className="shh-section-title" id="partners-title">
              Who we work with
            </h2>
            <p className="shh-section-text">
              If you help patients transition home—we want to be easy to reach.
            </p>
          </div>
          <div className="shh-area-list shh-partner-pills" role="list">
            {PARTNER_TYPES.map((label) => (
              <span key={label} role="listitem">
                {label}
              </span>
            ))}
          </div>
        </section>

        <section className="shh-section" id="services" aria-labelledby="ref-services-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Clinical scope</div>
            <h2 className="shh-section-title" id="ref-services-title">
              Services we accept referrals for
            </h2>
            <p className="shh-section-text">
              Skilled care at home under physician orders—tell us what the patient needs.
            </p>
          </div>
          <ul className="shh-referral-service-list">
            {REFERRAL_SERVICES.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="shh-section" id="why-saintly" aria-labelledby="why-partners-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Trust</div>
            <h2 className="shh-section-title" id="why-partners-title">
              Why referral partners choose Saintly
            </h2>
          </div>
          <div className="shh-why-grid">
            {WHY_PARTNERS.map((item) => (
              <article key={item.title} className="shh-why-card shh-why-card--referral">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shh-section" id="how-referrals" aria-labelledby="how-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Process</div>
            <h2 className="shh-section-title" id="how-title">
              How referrals work
            </h2>
          </div>
          <div className="shh-steps">
            {REFERRAL_STEPS.map((s) => (
              <div key={s.title} className="shh-step">
                <div className="shh-step-number">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="shh-section" id="referral-contact" aria-labelledby="ref-contact-title">
          <div className="shh-referral-contact-block">
            <div className="shh-section-header" style={{ marginBottom: 16 }}>
              <div className="shh-section-kicker">Referral desk</div>
              <h2 className="shh-section-title" id="ref-contact-title">
                Send referrals here
              </h2>
              <p className="shh-section-text">
                Use whichever channel fits your workflow—we monitor all lines during business hours.
              </p>
            </div>
            <div className="shh-referral-contact-grid">
              <div className="shh-referral-contact-item">
                <span className="shh-referral-contact-label">Call referrals</span>
                <a className="shh-referral-contact-value" href={TEL}>
                  {PHONE_REFERRAL_LINE}
                </a>
                <span className="shh-referral-contact-hint">Also {PHONE_DISPLAY}</span>
              </div>
              <div className="shh-referral-contact-item">
                <span className="shh-referral-contact-label">Fax referral</span>
                <span className="shh-referral-contact-value shh-referral-contact-value--static">{FAX_DISPLAY}</span>
                <span className="shh-referral-contact-hint">Orders &amp; clinical documents</span>
              </div>
              <div className="shh-referral-contact-item">
                <span className="shh-referral-contact-label">Email referral</span>
                <a className="shh-referral-contact-value" href={MAILTO_REFERRAL}>
                  {EMAIL_INTAKE}
                </a>
                <span className="shh-referral-contact-hint">Non-urgent referrals &amp; questions</span>
              </div>
              <div className="shh-referral-contact-item shh-referral-contact-item--wide">
                <span className="shh-referral-contact-label">Service area</span>
                <p className="shh-referral-contact-area">
                  Greater Phoenix and surrounding counties—Tempe-based coverage across Maricopa, Pinal, Gila,
                  Yavapai, Pima, and nearby communities.
                </p>
              </div>
            </div>
          </div>
        </section>

        <MarketingFinalCtaStrip variant="referrals" />

        <footer className="mt-10 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
          <p>
            © {new Date().getFullYear()} Saintly Home Health LLC · Tempe, Arizona
          </p>
          <p className="mt-3">
            <a href="/" className="font-medium text-slate-600 underline-offset-2 hover:text-slate-900">
              Home
            </a>
            {" · "}
            <a
              href="/services"
              className="font-medium text-slate-600 underline-offset-2 hover:text-slate-900"
            >
              Services
            </a>
            {" · "}
            <a
              href="/contact"
              className="font-medium text-slate-600 underline-offset-2 hover:text-slate-900"
            >
              Contact
            </a>
          </p>
        </footer>
      </div>

      <MarketingStickyMobileCta />
    </div>
  );
}
