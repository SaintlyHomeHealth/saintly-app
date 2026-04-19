/** Default marketing header links (homepage and sitewide). */
export const MARKETING_NAV_DEFAULT = [
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/faq", label: "FAQ" },
  { href: "/employment", label: "Employment" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** Services page: in-page anchor for Services (Home = logo). */
export const MARKETING_NAV_SERVICES_PAGE = [
  { href: "/services#featured", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/faq", label: "FAQ" },
  { href: "/employment", label: "Employment" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** Contact / intake page. */
export const MARKETING_NAV_CONTACT_PAGE = [
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/faq", label: "FAQ" },
  { href: "/employment", label: "Employment" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact#form", label: "Contact" },
] as const;

/** About page. */
export const MARKETING_NAV_ABOUT_PAGE = [
  { href: "/services", label: "Services" },
  { href: "/about#top", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/faq", label: "FAQ" },
  { href: "/employment", label: "Employment" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** Referral partners page. */
export const MARKETING_NAV_REFERRALS_PAGE = [
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals#top", label: "Referrals" },
  { href: "/faq", label: "FAQ" },
  { href: "/employment", label: "Employment" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** Careers / employment application. */
export const MARKETING_NAV_EMPLOYMENT_PAGE = [
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/faq", label: "FAQ" },
  { href: "/employment#top", label: "Employment" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** FAQ page. */
export const MARKETING_NAV_FAQ_PAGE = [
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/faq#top", label: "FAQ" },
  { href: "/employment", label: "Employment" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** Privacy Policy, Terms of Service, and other legal long-form pages. */
export const MARKETING_NAV_LEGAL_PAGE = [
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/faq", label: "FAQ" },
  { href: "/employment", label: "Employment" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
  { href: "/support", label: "Support" },
] as const;

export type MarketingNavLink = { href: string; label: string };
