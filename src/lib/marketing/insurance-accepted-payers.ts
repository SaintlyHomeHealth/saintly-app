/** A single insurance / plan logo shown in the public "Insurance & Plans We Accept" grid. */
export type InsurancePlan = {
  /** Display name (also used to build alt text). */
  name: string;
  /** Local logo path under `public/images/insurance/`. */
  logo: string;
  /** Short initials shown if the logo image fails to load. */
  initials: string;
  /** Optional compliance subtext rendered under the card (e.g. plan-specific caveats). */
  note?: string;
};

/**
 * Accepted insurance carriers / plans, in display order.
 * Logos are local, site-ready PNGs — never hotlink external images.
 */
export const INSURANCE_PLANS: InsurancePlan[] = [
  { name: "Medicare", logo: "/images/insurance/medicare-logo.png", initials: "MC" },
  { name: "AHCCCS Medicaid", logo: "/images/insurance/ahcccs-logo.png", initials: "AH" },
  {
    name: "UnitedHealthcare",
    logo: "/images/insurance/unitedhealthcare-logo.png",
    initials: "UHC",
    note: "Select plans only — full network expected 08/01/2026.",
  },
  { name: "Humana", logo: "/images/insurance/humana-logo.png", initials: "HU" },
  { name: "HealthSpring", logo: "/images/insurance/healthspring-logo.png", initials: "HS" },
  {
    name: "Arizona Complete Health",
    logo: "/images/insurance/arizona-complete-health-logo.png",
    initials: "ACH",
  },
  {
    name: "P3 Health Partners",
    logo: "/images/insurance/p3-health-partners-logo.png",
    initials: "P3",
  },
  {
    name: "Alignment Health",
    logo: "/images/insurance/alignment-health-logo.png",
    initials: "AL",
  },
  { name: "Cigna", logo: "/images/insurance/cigna-logo.png", initials: "CI" },
  { name: "Tango", logo: "/images/insurance/tango-logo.png", initials: "TG" },
];

/** Alt text helper — consistent, accessible wording for each plan logo. */
export function insurancePlanAlt(name: string): string {
  return `${name} accepted by Saintly Home Health`;
}

export const INSURANCE_ACCEPTED_HEADING = "Insurance & Plans We Accept";

export const INSURANCE_ACCEPTED_SUBHEADING =
  "Saintly Home Health works with Medicare, AHCCCS Medicaid, and select Medicare Advantage / managed care plans. Coverage varies by plan, authorization requirements, and service type.";

export const INSURANCE_ACCEPTED_DISCLAIMER =
  "Saintly Home Health accepts select Medicare Advantage, Medicaid, and managed care plans. Some plans may require eligibility verification, prior authorization, and payer approval before services begin. UnitedHealthcare is currently accepted for select plans only, with full network participation expected effective 08/01/2026.";
