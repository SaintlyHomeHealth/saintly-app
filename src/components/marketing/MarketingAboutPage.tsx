import {
  ABOUT_WHO_WE_ARE,
  CLINICAL_GROUPS,
  LEADERSHIP,
  WHY_CHOOSE,
} from "./marketing-about-content";
import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import { TEL } from "./marketing-constants";
import { MARKETING_NAV_ABOUT_PAGE } from "./marketing-nav";
import "./marketing-home.css";

export function MarketingAboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div id="top" className="shh-home-page">
        <MarketingSiteHeader navLinks={MARKETING_NAV_ABOUT_PAGE} />

        <section className="shh-hero shh-hero--page" aria-labelledby="about-hero-heading">
          <div className="shh-hero-inner shh-hero-inner--single">
            <div className="shh-hero-heading">
              <div className="shh-pill">
                <span aria-hidden>✧</span>
                About Saintly Home Health
              </div>
              <h1 id="about-hero-heading">
                Compassionate home health care, led by experienced clinicians
              </h1>
              <p className="shh-hero-sub">
                Medicare-certified home health for Greater Phoenix—skilled care at home with clear communication
                and a team that treats you like family.
              </p>
              <div className="shh-hero-cta">
                <a className="shh-btn-primary" href={TEL}>
                  Call now
                </a>
                <a className="shh-btn-secondary" href="/contact#form">
                  Talk to intake
                </a>
                <p className="shh-hero-cta-note">
                  Questions about coverage, referrals, or whether we serve your area—we&apos;re glad to help.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="shh-section" id="who-we-are" aria-labelledby="who-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Who we are</div>
            <h2 className="shh-section-title" id="who-title">
              Home health with heart—and high standards
            </h2>
          </div>
          <div className="shh-about-prose">
            {ABOUT_WHO_WE_ARE.map((p, i) => (
              <p key={i} className="shh-about-p">
                {p}
              </p>
            ))}
          </div>
        </section>

        <section className="shh-section" id="leadership" aria-labelledby="leadership-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Leadership</div>
            <h2 className="shh-section-title" id="leadership-title">
              Experienced oversight you can trust
            </h2>
            <p className="shh-section-text">
              Short introductions—our full team works together to keep care safe, timely, and respectful.
            </p>
          </div>
          <div className="shh-leader-grid">
            {LEADERSHIP.map((person) => (
              <article key={`${person.name}-${person.title}`} className="shh-leader-card">
                <h3 className="shh-leader-name">{person.name}</h3>
                <p className="shh-leader-role">{person.title}</p>
                <p className="shh-leader-summary">{person.summary}</p>
                {person.credentials ? (
                  <p className="shh-leader-creds">{person.credentials}</p>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="shh-section" id="clinical-team" aria-labelledby="clinical-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Clinical team</div>
            <h2 className="shh-section-title" id="clinical-title">
              Who you may meet
            </h2>
            <p className="shh-section-text">
              Your plan may include one or more disciplines—always ordered by your physician.
            </p>
          </div>
          <div className="shh-clinical-groups">
            {CLINICAL_GROUPS.map((g) => (
              <div key={g.title} className="shh-clinical-group">
                <h3>{g.title}</h3>
                <ul>
                  {g.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="shh-section" id="why-saintly" aria-labelledby="why-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Why Saintly</div>
            <h2 className="shh-section-title" id="why-title">
              What families tell us matters most
            </h2>
          </div>
          <div className="shh-why-grid">
            {WHY_CHOOSE.map((item) => (
              <article key={item.title} className="shh-why-card">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <MarketingFinalCtaStrip />

        <MarketingSiteFooter />
      </div>

      <MarketingStickyMobileCta />
    </div>
  );
}
