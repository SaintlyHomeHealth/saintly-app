/** Primary marketing site navigation (header). */
const MARKETING_NAV_SERVICE_LINKS = [
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
] as const;

const MARKETING_NAV_MIDDLE_DEFAULT = [
  ...MARKETING_NAV_SERVICE_LINKS,
  { href: "/referrals", label: "Referrals" },
  { href: "/insurance", label: "Insurance Accepted" },
  { href: "/employment", label: "Careers" },
] as const;

export const MARKETING_NAV_DEFAULT = [
  { href: "/", label: "Home" },
  ...MARKETING_NAV_MIDDLE_DEFAULT,
  { href: "/contact", label: "Contact" },
] as const;

/** Services page — same links; scroll targets resolve on the services page. */
export const MARKETING_NAV_SERVICES_PAGE = MARKETING_NAV_DEFAULT;

/** Contact / intake page — Contact jumps to the form. */
export const MARKETING_NAV_CONTACT_PAGE = [
  { href: "/", label: "Home" },
  ...MARKETING_NAV_SERVICE_LINKS,
  { href: "/referrals", label: "Referrals" },
  { href: "/insurance", label: "Insurance Accepted" },
  { href: "/employment", label: "Careers" },
  { href: "/contact#form", label: "Contact" },
] as const;

export const MARKETING_NAV_ABOUT_PAGE = MARKETING_NAV_DEFAULT;

export const MARKETING_NAV_REFERRALS_PAGE = [
  { href: "/", label: "Home" },
  ...MARKETING_NAV_SERVICE_LINKS,
  { href: "/referrals#top", label: "Referrals" },
  { href: "/insurance", label: "Insurance Accepted" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

export const MARKETING_NAV_EMPLOYMENT_PAGE = [
  { href: "/", label: "Home" },
  ...MARKETING_NAV_SERVICE_LINKS,
  { href: "/referrals", label: "Referrals" },
  { href: "/insurance", label: "Insurance Accepted" },
  { href: "/employment#top", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

export const MARKETING_NAV_FAQ_PAGE = MARKETING_NAV_DEFAULT;

/** Wound Care service page — make the active link self-anchored. */
export const MARKETING_NAV_WOUND_CARE_PAGE = MARKETING_NAV_DEFAULT;

/** Physical Therapy service page — make the active link self-anchored. */
export const MARKETING_NAV_PHYSICAL_THERAPY_PAGE = MARKETING_NAV_DEFAULT;

/** Home Health Aide service page — make the active link self-anchored. */
export const MARKETING_NAV_HOME_HEALTH_AIDE_PAGE = MARKETING_NAV_DEFAULT;

/** Skilled Nursing service page. */
export const MARKETING_NAV_SKILLED_NURSING_PAGE = MARKETING_NAV_DEFAULT;

/** Medicare & Coverage page. */
export const MARKETING_NAV_MEDICARE_PAGE = MARKETING_NAV_DEFAULT;

/** Insurance Accepted page — active nav link self-anchored. */
export const MARKETING_NAV_INSURANCE_PAGE = [
  { href: "/", label: "Home" },
  ...MARKETING_NAV_SERVICE_LINKS,
  { href: "/referrals", label: "Referrals" },
  { href: "/insurance", label: "Insurance Accepted" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

/** Privacy Policy, Terms of Service, and other legal long-form pages. */
export const MARKETING_NAV_LEGAL_PAGE = [
  { href: "/", label: "Home" },
  ...MARKETING_NAV_SERVICE_LINKS,
  { href: "/referrals", label: "Referrals" },
  { href: "/insurance", label: "Insurance Accepted" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
  { href: "/support", label: "Support" },
] as const;

export type MarketingNavLink = { href: string; label: string };
