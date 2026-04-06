/** Default marketing header links (homepage and sitewide). */
export const MARKETING_NAV_DEFAULT = [
  { href: "/services", label: "Services" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/#intake", label: "Contact" },
] as const;

/** Services page: include Home + in-page anchors. */
export const MARKETING_NAV_SERVICES_PAGE = [
  { href: "/", label: "Home" },
  { href: "/services#featured", label: "Services" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Service area" },
  { href: "/services#intake", label: "Contact" },
] as const;

export type MarketingNavLink = { href: string; label: string };
