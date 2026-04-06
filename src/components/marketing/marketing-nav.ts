/** Default marketing header links (homepage and sitewide). */
export const MARKETING_NAV_DEFAULT = [
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** Services page: include Home + in-page anchors. */
export const MARKETING_NAV_SERVICES_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services#featured", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** Contact / intake page. */
export const MARKETING_NAV_CONTACT_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact#form", label: "Contact" },
] as const;

/** About page. */
export const MARKETING_NAV_ABOUT_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about#top", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

/** Referral partners page. */
export const MARKETING_NAV_REFERRALS_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals#top", label: "Referrals" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/contact", label: "Contact" },
] as const;

export type MarketingNavLink = { href: string; label: string };
