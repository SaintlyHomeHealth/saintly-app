import { PHONE_DISPLAY, TEL } from "./marketing-constants";

export function MarketingFinalCtaStrip() {
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
