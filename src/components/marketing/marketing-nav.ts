/** Primary marketing site navigation (header). */
export const MARKETING_NAV_DEFAULT = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

/** Services page — same links; scroll targets resolve on the services page. */
export const MARKETING_NAV_SERVICES_PAGE = MARKETING_NAV_DEFAULT;

/** Contact / intake page — Contact jumps to the form. */
export const MARKETING_NAV_CONTACT_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact#form", label: "Contact" },
] as const;

export const MARKETING_NAV_ABOUT_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

export const MARKETING_NAV_REFERRALS_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals#top", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

export const MARKETING_NAV_EMPLOYMENT_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment#top", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

export const MARKETING_NAV_FAQ_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

/** Wound Care service page — make the active link self-anchored. */
export const MARKETING_NAV_WOUND_CARE_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

/** Physical Therapy service page — make the active link self-anchored. */
export const MARKETING_NAV_PHYSICAL_THERAPY_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

/** Home Health Aide service page — make the active link self-anchored. */
export const MARKETING_NAV_HOME_HEALTH_AIDE_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

/** Skilled Nursing service page. */
export const MARKETING_NAV_SKILLED_NURSING_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

/** Medicare & Coverage page. */
export const MARKETING_NAV_MEDICARE_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

/** Privacy Policy, Terms of Service, and other legal long-form pages. */
export const MARKETING_NAV_LEGAL_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
  { href: "/referrals", label: "Referrals" },
  { href: "/employment", label: "Careers" },
  { href: "/contact", label: "Contact" },
  { href: "/support", label: "Support" },
] as const;

export type MarketingNavLink = { href: string; label: string };
