import { FAQ_CATEGORIES } from "./marketing-faq-content";
import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import { EMAIL_INTAKE, FAX_DISPLAY, MAILTO_INTAKE, TEL } from "./marketing-constants";
import { MARKETING_NAV_FAQ_PAGE } from "./marketing-nav";
import "./marketing-home.css";

const PHONE_FAQ_LINE = "480-360-0008";

const MAILTO_GENERAL = `${MAILTO_INTAKE}?subject=${encodeURIComponent("Question — Saintly Home Health")}`;

export function MarketingFaqPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div id="top" className="shh-home-page">
        <MarketingSiteHeader navLinks={MARKETING_NAV_FAQ_PAGE} />

        <section className="shh-hero shh-hero--page" aria-labelledby="faq-hero-heading">
          <div className="shh-hero-inner shh-hero-inner--single">
            <div className="shh-hero-heading">
              <div className="shh-pill">
                <span aria-hidden>✧</span>
                Help center · Saintly Home Health
              </div>
              <h1 id="faq-hero-heading">Frequently asked questions about home health</h1>
              <p className="shh-hero-sub">
                Get quick answers about eligibility, Medicare coverage, services at home, referrals, and how
                to get started with Saintly Home Health.
              </p>
              <div className="shh-hero-cta">
                <a className="shh-btn-primary" href={TEL}>
                  Call now
                </a>
                <a className="shh-btn-secondary" href="/contact#form">
                  Talk to intake
                </a>
                <p className="shh-hero-cta-note shh-hero-cta-note--compact">
                  <span className="block sm:inline">Phone: {PHONE_FAQ_LINE}</span>
                  <span className="hidden sm:inline"> · </span>
                  <span className="block sm:inline">Fax: {FAX_DISPLAY}</span>
                  <span className="hidden sm:inline"> · </span>
                  <span className="block sm:inline">{EMAIL_INTAKE}</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <nav className="shh-faq-toc" aria-label="FAQ categories">
          <p className="shh-faq-toc-label">Jump to:</p>
          <ul>
            {FAQ_CATEGORIES.map((cat) => (
              <li key={cat.id}>
                <a href={`#${cat.id}`}>{cat.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="shh-faq-stack">
          {FAQ_CATEGORIES.map((cat) => (
            <section key={cat.id} className="shh-section" id={cat.id} aria-labelledby={`faq-cat-${cat.id}`}>
              <h2 className="shh-faq-category-title" id={`faq-cat-${cat.id}`}>
                {cat.title}
              </h2>
              <ul className="shh-faq-list">
                {cat.items.map((item) => (
                  <li key={item.q}>
                    <details className="shh-faq-details">
                      <summary className="shh-faq-summary">{item.q}</summary>
                      <div className="shh-faq-answer">
                        <p>{item.a}</p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="shh-section" id="still-questions" aria-labelledby="help-block-title">
          <div className="shh-faq-help-block">
            <h2 className="shh-faq-help-title" id="help-block-title">
              Still have questions?
            </h2>
            <p className="shh-faq-help-lead">
              We’re here to help—no pressure. Reach us the way that works best for you.
            </p>
            <div className="shh-faq-help-grid">
              <div className="shh-faq-help-item">
                <span className="shh-faq-help-label">Call us</span>
                <a className="shh-faq-help-value" href={TEL}>
                  {PHONE_FAQ_LINE}
                </a>
              </div>
              <div className="shh-faq-help-item">
                <span className="shh-faq-help-label">Fax referral</span>
                <span className="shh-faq-help-value shh-faq-help-value--muted">{FAX_DISPLAY}</span>
              </div>
              <div className="shh-faq-help-item">
                <span className="shh-faq-help-label">Contact intake</span>
                <a className="shh-faq-help-value" href="/contact#form">
                  Message our team
                </a>
                <span className="shh-faq-help-hint">Or email {EMAIL_INTAKE}</span>
              </div>
            </div>
            <p className="shh-faq-help-email">
              <a href={MAILTO_GENERAL} className="text-blue-700 font-semibold underline-offset-2 hover:underline">
                {EMAIL_INTAKE}
              </a>
            </p>
          </div>
        </section>

        <MarketingFinalCtaStrip />

        <MarketingSiteFooter />
      </div>

      <MarketingStickyMobileCta />
    </div>
  );
}
