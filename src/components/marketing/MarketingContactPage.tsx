import { MarketingContactForm } from "./MarketingContactForm";
import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import {
  ADDRESS_LINE_CITY,
  ADDRESS_LINE_STREET,
  EMAIL_INTAKE,
  FAX_DISPLAY,
  MAILTO_INTAKE,
  PHONE_DISPLAY,
  TEL,
} from "./marketing-constants";
import { MARKETING_NAV_CONTACT_PAGE } from "./marketing-nav";
import "./marketing-home.css";

const PHONE_CARD_DISPLAY = "480-360-0008";

const HOW_WE_HELP = [
  {
    title: "Questions about home health",
    body: "What we do, how visits work, and what to expect from our team.",
  },
  {
    title: "Medicare eligibility help",
    body: "Plain-language guidance on coverage and what your doctor needs to order.",
  },
  {
    title: "Wound care at home",
    body: "Dressing changes, monitoring, and teaching for complex or slow-healing wounds.",
  },
  {
    title: "Skilled nursing at home",
    body: "Assessments, injections, vitals, and medication support with physician follow-up.",
  },
  {
    title: "Therapy at home",
    body: "PT, OT, and ST focused on your goals—without traveling to a clinic.",
  },
  {
    title: "Help after hospital discharge",
    body: "Coordination with your care team so the next steps at home feel clear.",
  },
] as const;

export function MarketingContactPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div id="top" className="shh-home-page">
        <MarketingSiteHeader navLinks={MARKETING_NAV_CONTACT_PAGE} />

        <section className="shh-hero shh-hero--page" aria-labelledby="contact-hero-heading">
          <div className="shh-hero-inner shh-hero-inner--single">
            <div className="shh-hero-heading">
              <div className="shh-pill">
                <span aria-hidden>✧</span>
                Intake &amp; referrals · Tempe, AZ
              </div>
              <h1 id="contact-hero-heading">Talk to our intake team</h1>
              <p className="shh-hero-sub">
                We&apos;ll review your situation, explain next steps, and help coordinate with your doctor—no
                pressure, just clear answers.
              </p>
              <div className="shh-hero-cta">
                <a className="shh-btn-primary" href={TEL}>
                  Call now
                </a>
                <a className="shh-btn-secondary" href={TEL}>
                  Check Medicare eligibility
                </a>
                <p className="shh-hero-cta-note">
                  Same-day or next-business-day follow-up when you leave a message—we&apos;re here to help
                  families and referral partners.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="shh-section" id="quick-contact" aria-labelledby="quick-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Reach us</div>
            <h2 className="shh-section-title" id="quick-title">
              Quick contact
            </h2>
            <p className="shh-section-text">
              Save this page—everything you need to reach intake or send a referral.
            </p>
          </div>
          <div className="shh-contact-quick-grid">
            <div className="shh-contact-quick-card">
              <div className="shh-contact-quick-label">Phone</div>
              <a className="shh-contact-quick-value shh-contact-link" href={TEL}>
                {PHONE_CARD_DISPLAY}
              </a>
              <p className="shh-contact-quick-meta">Also: {PHONE_DISPLAY}</p>
            </div>
            <div className="shh-contact-quick-card">
              <div className="shh-contact-quick-label">Fax</div>
              <p className="shh-contact-quick-value">{FAX_DISPLAY}</p>
              <p className="shh-contact-quick-meta">Referrals &amp; documents</p>
            </div>
            <div className="shh-contact-quick-card">
              <div className="shh-contact-quick-label">Email</div>
              <a className="shh-contact-quick-value shh-contact-link" href={MAILTO_INTAKE}>
                {EMAIL_INTAKE}
              </a>
              <p className="shh-contact-quick-meta">Intake &amp; general questions</p>
            </div>
            <div className="shh-contact-quick-card shh-contact-quick-card--wide">
              <div className="shh-contact-quick-label">Office address</div>
              <p className="shh-contact-quick-value shh-contact-address">
                {ADDRESS_LINE_STREET}
                <br />
                {ADDRESS_LINE_CITY}
              </p>
            </div>
            <div className="shh-contact-quick-card">
              <div className="shh-contact-quick-label">Service area</div>
              <p className="shh-contact-quick-value">Greater Phoenix &amp; surrounding counties</p>
              <p className="shh-contact-quick-meta">Maricopa, Pinal, Gila, Yavapai, Pima &amp; nearby</p>
            </div>
          </div>
        </section>

        <section className="shh-section" id="how-we-help" aria-labelledby="help-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">How we can help</div>
            <h2 className="shh-section-title" id="help-title">
              Common reasons people call
            </h2>
            <p className="shh-section-text">
              Tell us what you&apos;re dealing with—we&apos;ll match you with the right next step.
            </p>
          </div>
          <div className="shh-help-grid">
            {HOW_WE_HELP.map((item) => (
              <article key={item.title} className="shh-help-card">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shh-section" id="referrals" aria-labelledby="referral-title">
          <div className="shh-referral-panel">
            <div className="shh-section-header" style={{ marginBottom: 14 }}>
              <div className="shh-section-kicker">For professionals</div>
              <h2 className="shh-section-title" id="referral-title">
                Referrals &amp; care coordination
              </h2>
              <p className="shh-section-text">
                Physicians, case managers, discharge planners, and referral partners—we welcome your
                patients and will confirm receipt quickly.
              </p>
            </div>
            <div className="shh-referral-actions">
              <div className="shh-referral-channel">
                <span className="shh-referral-channel-label">Call</span>
                <a href={TEL} className="shh-referral-channel-value">
                  {PHONE_DISPLAY}
                </a>
                <span className="shh-referral-channel-hint">Fastest for urgent discharges</span>
              </div>
              <div className="shh-referral-channel">
                <span className="shh-referral-channel-label">Fax</span>
                <span className="shh-referral-channel-value">{FAX_DISPLAY}</span>
                <span className="shh-referral-channel-hint">Orders &amp; clinical documents</span>
              </div>
              <div className="shh-referral-channel">
                <span className="shh-referral-channel-label">Email</span>
                <a href={MAILTO_INTAKE} className="shh-referral-channel-value shh-contact-link">
                  {EMAIL_INTAKE}
                </a>
                <span className="shh-referral-channel-hint">Non-urgent referrals &amp; questions</span>
              </div>
            </div>
          </div>
        </section>

        <section className="shh-section" id="form" aria-labelledby="form-title">
          <div className="shh-intake-form-wrap">
            <div className="shh-section-header" style={{ marginBottom: 18 }}>
              <div className="shh-section-kicker">Send a message</div>
              <h2 className="shh-section-title" id="form-title">
                Intake form
              </h2>
              <p className="shh-section-text">
                Share a few details—we&apos;ll respond by phone or email. Prefer to talk now? Call{" "}
                <a href={TEL} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                  {PHONE_DISPLAY}
                </a>
                .
              </p>
            </div>
            <MarketingContactForm />
          </div>
        </section>

        <MarketingFinalCtaStrip />

        <MarketingSiteFooter />
      </div>

      <MarketingStickyMobileCta />
    </div>
  );
}
