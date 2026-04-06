import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import { TEL } from "./marketing-constants";
import { MARKETING_NAV_SERVICES_PAGE } from "./marketing-nav";
import "./marketing-home.css";

const FEATURED = [
  {
    icon: "✚",
    tag: "Wound care",
    title: "Advanced wound care",
    body: "Dressing changes, infection monitoring, and teaching for chronic, surgical, and diabetic wounds.",
  },
  {
    icon: "RN",
    tag: "Nursing",
    title: "Skilled nursing",
    body: "Assessments, injections, vitals, and medication teaching with updates to your physician.",
  },
  {
    icon: "PT",
    tag: "Therapy",
    title: "Physical therapy",
    body: "Strength, balance, gait, and mobility after surgery or illness—without clinic visits.",
  },
  {
    icon: "OT",
    tag: "Therapy",
    title: "Occupational Therapy",
    body: "Daily living skills—dressing, bathing, cooking—so you stay as independent as possible.",
  },
  {
    icon: "ST",
    tag: "Therapy",
    title: "Speech Therapy",
    body: "Speech, language, cognition, and swallowing support after stroke, illness, or injury.",
  },
] as const;

const ADDITIONAL = [
  {
    icon: "◎",
    tag: "Catheter",
    title: "Catheter care",
    body: "Maintenance, skin checks, and teaching for comfort and infection prevention.",
  },
  {
    icon: "◎",
    tag: "Ostomy",
    title: "Ostomy care",
    body: "Appliance changes, skin protection, and confidence-building support at home.",
  },
  {
    icon: "Rx",
    tag: "Meds",
    title: "Medication management",
    body: "Reviews and teaching so doses, times, and side effects stay clear for you and your doctor.",
  },
  {
    icon: "MSW",
    tag: "Support",
    title: "Medical social work",
    body: "Resources, planning, and emotional support for families navigating complex care.",
  },
  {
    icon: "♥",
    tag: "Care",
    title: "Home health aide support",
    body: "Personal care under professional direction—safety, comfort, and dignity first.",
  },
] as const;

const WHO_WE_HELP = [
  "Recent hospital discharge",
  "Wound not healing",
  "Trouble with mobility",
  "Fall risk",
  "Need therapy at home",
  "Need nursing oversight at home",
] as const;

export function MarketingServicesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div id="top" className="shh-home-page">
        <MarketingSiteHeader navLinks={MARKETING_NAV_SERVICES_PAGE} />

        <section className="shh-hero shh-hero--page" aria-labelledby="services-hero-heading">
          <div className="shh-hero-inner shh-hero-inner--single">
            <div className="shh-hero-heading">
              <div className="shh-pill">
                <span aria-hidden>✧</span>
                Medicare-certified · Greater Phoenix
              </div>
              <h1 id="services-hero-heading">Home health services we provide</h1>
              <p className="shh-hero-sub">
                Skilled nursing, wound care, and therapy in your home—ordered by your physician, delivered
                by our Tempe-based team.
              </p>
              <div className="shh-hero-cta">
                <a className="shh-btn-primary" href={TEL}>
                  Call now
                </a>
                <a className="shh-btn-secondary" href={TEL}>
                  Check eligibility
                </a>
                <p className="shh-hero-cta-note">
                  We’ll explain coverage, answer questions, and help coordinate with your doctor’s office.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="shh-section" id="featured" aria-labelledby="featured-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Featured services</div>
            <h2 className="shh-section-title" id="featured-title">
              What we do most often
            </h2>
            <p className="shh-section-text">
              Every plan is individualized. These are the core services families ask for first.
            </p>
          </div>
          <div className="shh-service-grid">
            {FEATURED.map((s) => (
              <article key={s.title} className="shh-service-card shh-service-card--featured">
                <div className="shh-service-tag">
                  <span aria-hidden>{s.icon}</span> {s.tag}
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shh-section" id="additional" aria-labelledby="additional-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Additional services</div>
            <h2 className="shh-section-title" id="additional-title">
              More ways we support you at home
            </h2>
            <p className="shh-section-text">
              Available when ordered as part of your plan of care.
            </p>
          </div>
          <div className="shh-service-grid">
            {ADDITIONAL.map((s) => (
              <article key={s.title} className="shh-service-card">
                <div className="shh-service-tag">
                  <span aria-hidden>{s.icon}</span> {s.tag}
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shh-section" id="who-we-help" aria-labelledby="who-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Who we help</div>
            <h2 className="shh-section-title" id="who-title">
              Common reasons families call us
            </h2>
            <p className="shh-section-text">
              Not sure if you qualify? Call—we’ll ask a few questions and guide you.
            </p>
          </div>
          <ul className="shh-who-grid">
            {WHO_WE_HELP.map((line) => (
              <li key={line} className="shh-who-item">
                <span className="shh-who-check" aria-hidden>
                  ✓
                </span>
                {line}
              </li>
            ))}
          </ul>
        </section>

        <section className="shh-section" id="medicare" aria-labelledby="medicare-title">
          <div className="shh-medicare">
            <div className="shh-section-header" style={{ marginBottom: 12 }}>
              <div className="shh-section-kicker">Medicare &amp; eligibility</div>
              <h2 className="shh-section-title" id="medicare-title">
                How home health coverage works
              </h2>
            </div>
            <ul className="shh-medicare-list">
              <li>
                <strong>Doctor-ordered.</strong> Your physician certifies that you need skilled care at
                home and stays involved in your plan.
              </li>
              <li>
                <strong>Medically necessary.</strong> Services must match your condition and recovery
                goals—not long-term custodial care.
              </li>
              <li>
                <strong>Medicare Part A/B.</strong> If you qualify, Medicare often covers approved home
                health at <strong>100%</strong> (no copay for covered visits).
              </li>
              <li>
                <strong>We verify with you.</strong> Our intake team reviews your situation and explains
                next steps—no pressure.
              </li>
            </ul>
            <p className="shh-medicare-footnote">
              Medicare Advantage, AHCCCS, and Veterans programs—we’re actively contracting; ask us about
              your plan.
            </p>
          </div>
        </section>

        <MarketingFinalCtaStrip />

        <footer className="mt-10 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
          <p>
            © {new Date().getFullYear()} Saintly Home Health LLC · Tempe, Arizona
          </p>
          <p className="mt-3">
            <a href="/" className="font-medium text-slate-600 underline-offset-2 hover:text-slate-900">
              Back to home
            </a>
            {" · "}
            <a
              href="/employment"
              className="font-medium text-slate-600 underline-offset-2 hover:text-slate-900"
            >
              Staff: apply online
            </a>
          </p>
        </footer>
      </div>

      <MarketingStickyMobileCta />
    </div>
  );
}
