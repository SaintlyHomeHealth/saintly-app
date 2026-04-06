'use client'

/** Subtle fixed bar on small screens — hidden on md+ via CSS */
export function MarketingStickyMobileCta() {
  return (
    <div className="shh-sticky-cta" role="region" aria-label="Quick contact">
      <a className="shh-sticky-call" href="tel:+14803600008">
        Call now
      </a>
      <a className="shh-sticky-secondary" href="#intake">
        Intake help
      </a>
    </div>
  )
}
