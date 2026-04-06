import { MAILTO_INTAKE, PHONE_DISPLAY, TEL } from "./marketing-constants";

const MAILTO_REFERRAL = `${MAILTO_INTAKE}?subject=${encodeURIComponent("Referral — Saintly Home Health")}`;

export type MarketingFinalCtaVariant = "default" | "referrals";

type MarketingFinalCtaStripProps = {
  variant?: MarketingFinalCtaVariant;
};

export function MarketingFinalCtaStrip({ variant = "default" }: MarketingFinalCtaStripProps) {
  if (variant === "referrals") {
    return (
      <section
        className="shh-final-cta"
        id="intake"
        aria-labelledby="referral-cta-title"
      >
        <div>
          <h2 id="referral-cta-title">Send a referral or reach intake</h2>
          <p>
            Call <a href={TEL} className="text-sky-300 underline underline-offset-2">{PHONE_DISPLAY}</a>
            , fax orders to our line, or email{" "}
            <a href={MAILTO_REFERRAL} className="text-sky-300 underline underline-offset-2">
              our team
            </a>
            . We respond quickly during business hours.
          </p>
        </div>
        <div className="shh-final-cta-actions shh-final-cta-actions--triple">
          <a className="shh-btn-primary shh-btn-primary--lg" href={MAILTO_REFERRAL}>
            Send a referral
          </a>
          <a className="shh-btn-outline-light" href={TEL}>
            Call intake
          </a>
          <a className="shh-btn-outline-light" href="/contact#form">
            Contact our team
          </a>
        </div>
      </section>
    );
  }

  return (
    <section
      className="shh-final-cta"
      id="intake"
      aria-labelledby="intake-title"
    >
      <div>
        <h2 id="intake-title">Talk to our intake team</h2>
        <p>
          Check Medicare eligibility, ask about home health, and get help coordinating with your
          doctor—call{" "}
          <a href={TEL} className="text-sky-300 underline underline-offset-2">
            {PHONE_DISPLAY}
          </a>
          .
        </p>
      </div>
      <div className="shh-final-cta-actions">
        <a className="shh-btn-primary shh-btn-primary--lg" href={TEL}>
          Call now
        </a>
        <a className="shh-btn-outline-light" href={TEL}>
          Check Medicare eligibility
        </a>
      </div>
    </section>
  );
}
