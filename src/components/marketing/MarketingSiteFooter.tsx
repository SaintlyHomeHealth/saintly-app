import Link from "next/link";

const primaryLinks = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/referrals", label: "Referrals" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
  { href: "/employment", label: "Employment" },
] as const;

const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/support", label: "Support" },
  { href: "/security", label: "Security" },
] as const;

const linkClass = "font-medium text-slate-600 underline-offset-2 hover:text-slate-900";

export function MarketingSiteFooter() {
  return (
    <footer className="mt-10 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
      <p>© {new Date().getFullYear()} Saintly Home Health LLC · Tempe, Arizona</p>
      <nav className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[13px]" aria-label="Site">
        {primaryLinks.map((item, i) => (
          <span key={item.href} className="inline-flex items-center gap-x-2">
            {i > 0 ? <span className="text-slate-300" aria-hidden>·</span> : null}
            <Link href={item.href} className={linkClass}>
              {item.label}
            </Link>
          </span>
        ))}
      </nav>
      <nav
        className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-500"
        aria-label="Legal"
      >
        {legalLinks.map((item) => (
          <Link key={item.href} href={item.href} className={`${linkClass} text-slate-600`}>
            {item.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
