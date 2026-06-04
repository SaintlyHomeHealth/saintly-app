import Link from "next/link";
import { Mail, Phone, Printer } from "lucide-react";
import {
  ADDRESS_LINE_CITY,
  ADDRESS_LINE_STREET,
  EMAIL_INTAKE,
  FAX_DISPLAY,
  MAILTO_INTAKE,
  PHONE_DISPLAY,
  TEL,
} from "./marketing-constants";
import { MarketingBrandLockup } from "./MarketingBrandLockup";

const linkMuted = "text-slate-700 transition hover:text-amber-700";
const colHeading = "text-[12px] font-bold uppercase tracking-[0.2em] text-slate-800";
const subEyebrow = "block text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700/90";

const servicesLinks = [
  { href: "/services/skilled-nursing", label: "Skilled Nursing" },
  { href: "/services/wound-care", label: "Wound Care" },
  { href: "/services/physical-therapy", label: "Physical Therapy" },
  { href: "/services/home-health-aide", label: "Home Health Aide" },
] as const;

const patientsLinks = [
  { href: "/referrals", label: "Referrals" },
  { href: "/medicare", label: "Medicare & Coverage" },
  { href: "/faq", label: "FAQs" },
] as const;

const companyLinks = [
  { href: "/employment", label: "Careers" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
] as const;

export function MarketingSiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="relative overflow-hidden border-t border-amber-100/70 px-5 pb-16 pt-24 text-slate-700 sm:px-7 sm:pt-28 lg:px-10"
      style={{
        background:
          "linear-gradient(180deg, #fffaf0 0%, #fff5e0 55%, #fffaf0 100%)",
      }}
    >
      {/* Faint top warmth wash */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FFC72C]/55 to-transparent"
        aria-hidden
      />
      {/* Soft halo blobs */}
      <div
        className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-[#FFC72C]/12 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-0 h-72 w-72 rounded-full bg-sky-200/35 blur-[110px]"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-[84rem] gap-14 md:grid-cols-2 md:gap-14 lg:grid-cols-[1.3fr_1fr_1fr_1fr_minmax(0,1.2fr)] lg:gap-14 xl:gap-20">
        <div className="max-w-sm">
          <Link
            href="/"
            className="inline-flex flex-wrap items-center"
            aria-label="Saintly Home Health"
          >
            <MarketingBrandLockup variant="footer" />
          </Link>
          <p className="mt-7 max-w-[22rem] text-[16px] leading-[1.7] text-slate-700">
            Skilled home health care delivered with compassion, professionalism, and clinical
            excellence — right at home in Greater Phoenix.
          </p>
        </div>

        <div>
          <p className={colHeading}>Services</p>
          <ul className="mt-6 space-y-3.5 text-[16px]">
            {servicesLinks.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className={linkMuted}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className={colHeading}>Patients &amp; Families</p>
          <ul className="mt-6 space-y-3.5 text-[16px]">
            {patientsLinks.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className={linkMuted}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className={colHeading}>Company</p>
          <ul className="mt-6 space-y-3.5 text-[16px]">
            {companyLinks.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className={linkMuted}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className={colHeading}>Contact</p>
          <ul className="mt-6 space-y-4 text-[16px]">
            <li className="leading-tight">
              <span className={subEyebrow}>Call</span>
              <a
                href={TEL}
                className={`mt-1.5 inline-flex items-center gap-2 text-[18px] font-semibold ${linkMuted}`}
              >
                <Phone className="h-4 w-4 text-amber-600" strokeWidth={2.25} aria-hidden />
                {PHONE_DISPLAY}
              </a>
            </li>
            <li className="leading-tight">
              <span className={subEyebrow}>Fax</span>
              <span className="mt-1.5 inline-flex items-center gap-2 text-[18px] font-semibold text-slate-800">
                <Printer className="h-4 w-4 text-amber-600" strokeWidth={2.25} aria-hidden />
                {FAX_DISPLAY}
              </span>
            </li>
            <li className="leading-tight">
              <span className={subEyebrow}>Email</span>
              <a
                href={MAILTO_INTAKE}
                className={`mt-1.5 inline-flex items-center gap-2 break-words text-[16px] font-semibold ${linkMuted}`}
              >
                <Mail className="h-4 w-4 text-amber-600" strokeWidth={2.25} aria-hidden />
                {EMAIL_INTAKE}
              </a>
            </li>
            <li className="pt-1 leading-tight">
              <span className={subEyebrow}>Address</span>
              <p className="mt-1.5 text-[15px] leading-[1.55] text-slate-700">
                {ADDRESS_LINE_STREET}
                <br />
                {ADDRESS_LINE_CITY}
              </p>
            </li>
          </ul>
        </div>
      </div>

      <div className="relative mx-auto mt-20 max-w-[84rem] border-t border-amber-100/80 pt-9 text-[14px] text-slate-600 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <p>© {year} Saintly Home Health LLC. All rights reserved.</p>
        <nav
          className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:mt-0 sm:justify-end"
          aria-label="Legal"
        >
          <Link href="/privacy" className="underline-offset-2 hover:text-amber-700 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/compliance-program" className="underline-offset-2 hover:text-amber-700 hover:underline">
            Compliance Program
          </Link>
          <Link href="/terms" className="underline-offset-2 hover:text-amber-700 hover:underline">
            Terms of Service
          </Link>
          <a href="/hipaa.pdf" className="underline-offset-2 hover:text-amber-700 hover:underline">
            HIPAA Notice
          </a>
        </nav>
      </div>
    </footer>
  );
}
