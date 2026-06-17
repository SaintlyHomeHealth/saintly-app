/** Status styling for insurance / payer cards on the public website. */
export type InsurancePayerStatusKind =
  | "accepted"
  | "accepted-with-verification"
  | "accepted-through-tango"
  | "accepted-with-authorization"
  | "starts-on-date"
  | "network-partner";

export type InsurancePayer = {
  id: string;
  name: string;
  /** Filename under `public/logos/insurance/`. */
  logoFile: string;
  logoAlt: string;
  /** Short initials shown when the logo image is missing. */
  logoInitials: string;
  statusLabel: string;
  statusKind: InsurancePayerStatusKind;
  note: string;
  /** Extra line on upcoming-participation cards (e.g. UnitedHealthcare). */
  helperText?: string;
  /** When set, renders a prominent date badge (e.g. UnitedHealthcare). */
  startsDateLabel?: string;
  /** Network / authorization partners — rendered in a separate group. */
  isNetworkPartner?: boolean;
};

/** Insurance carriers Saintly accepts or participates with (public website). */
export const INSURANCE_ACCEPTED_PAYERS: InsurancePayer[] = [
  {
    id: "medicare",
    name: "Original Medicare",
    logoFile: "medicare.png",
    logoAlt: "Original Medicare logo",
    logoInitials: "MC",
    statusLabel: "Accepted",
    statusKind: "accepted",
    note: "Traditional Medicare accepted.",
  },
  {
    id: "ahcccs",
    name: "AHCCCS / Arizona Medicaid",
    logoFile: "ahcccs.png",
    logoAlt: "AHCCCS Arizona Medicaid logo",
    logoInitials: "AH",
    statusLabel: "Accepted with eligibility & auth verification",
    statusKind: "accepted-with-verification",
    note: "AHCCCS Provider ID active. Verify member eligibility and authorization.",
  },
  {
    id: "arizona-complete-health",
    name: "Arizona Complete Health",
    logoFile: "arizona-complete-health.png",
    logoAlt: "Arizona Complete Health logo",
    logoInitials: "ACH",
    statusLabel: "Accepted through Tango authorization",
    statusKind: "accepted-through-tango",
    note: "Referrals and authorizations must be routed through Tango when applicable.",
  },
  {
    id: "alignment-health",
    name: "Alignment Health / Alignment Healthcare Arizona",
    logoFile: "alignment-health.png",
    logoAlt: "Alignment Health logo",
    logoInitials: "AH",
    statusLabel: "Accepted with authorization",
    statusKind: "accepted-with-authorization",
    note: "Medicare Advantage members accepted when eligible and authorized.",
  },
  {
    id: "unitedhealthcare",
    name: "UnitedHealthcare",
    logoFile: "unitedhealthcare.png",
    logoAlt: "UnitedHealthcare logo",
    logoInitials: "UHC",
    statusLabel: "Starts 08/01/2026",
    statusKind: "starts-on-date",
    startsDateLabel: "Starts 08/01/2026",
    helperText: "Medicare Advantage participation begins 08/01/2026.",
    note: "Not yet in network — participation begins 08/01/2026. Contact us to verify plan details.",
  },
];

/** Not an insurance carrier — authorization / referral network partner. */
export const INSURANCE_NETWORK_PARTNERS: InsurancePayer[] = [
  {
    id: "tango",
    name: "Tango / PHCN",
    logoFile: "tango.png",
    logoAlt: "Tango PHCN network partner logo",
    logoInitials: "TG",
    statusLabel: "Network & authorization partner",
    statusKind: "network-partner",
    note: "Tango is not the insurance company. Saintly accepts Tango-authorized referrals when applicable.",
    isNetworkPartner: true,
  },
];

export const INSURANCE_ACCEPTED_DISCLAIMER =
  "Coverage depends on member eligibility, plan benefits, service area, and prior authorization requirements. Please contact Saintly Home Health so we can verify benefits before starting care.";

export const INSURANCE_ACCEPTED_INTRO =
  "Saintly Home Health works with Medicare, Medicaid, Medicare Advantage, and authorized network partners to help patients receive skilled home health services in Arizona.";

export const INSURANCE_LOGO_BASE_PATH = "/logos/insurance";
