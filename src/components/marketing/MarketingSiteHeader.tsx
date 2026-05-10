"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { useState } from "react";
import { MarketingBrandLockup } from "./MarketingBrandLockup";
import { PHONE_DISPLAY, TEL } from "./marketing-constants";
import { MARKETING_NAV_DEFAULT, type MarketingNavLink } from "./marketing-nav";

type MarketingSiteHeaderProps = {
  navLinks?: readonly MarketingNavLink[];
};

/** Desktop nav + CTA at this width avoids cramped mid-size tablet/laptop headers (see ~1024–1100px). */
const DESKTOP_NAV = "min-[1100px]";

export function MarketingSiteHeader({
  navLinks = MARKETING_NAV_DEFAULT,
}: MarketingSiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const links = navLinks as MarketingNavLink[];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 shadow-[0_2px_24px_-12px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div
        className={`mx-auto grid max-w-[88rem] grid-cols-[1fr_auto] items-center gap-3 px-5 py-4 sm:px-7 sm:py-5 ${DESKTOP_NAV}:grid-cols-[minmax(0,auto)_1fr_auto] ${DESKTOP_NAV}:gap-6 ${DESKTOP_NAV}:px-10 ${DESKTOP_NAV}:py-6`}
      >
        <Link
          href="/"
          className="flex min-w-0 items-center"
          aria-label="Saintly Home Health"
          title="Saintly Home Health"
          onClick={() => setOpen(false)}
        >
          <MarketingBrandLockup variant="header" />
        </Link>

        <nav
          className={`hidden min-w-0 flex-wrap items-center justify-center justify-self-center gap-1 ${DESKTOP_NAV}:flex`}
          aria-label="Primary"
        >
          {links.map((l) => (
            <Link
              key={`${l.href}-${l.label}`}
              href={l.href}
              className="whitespace-nowrap rounded-full px-3 py-2.5 text-center text-[13px] font-semibold leading-tight tracking-tight text-slate-700 transition-colors hover:bg-sky-50 hover:text-blue-800 min-[1280px]:px-3.5 min-[1280px]:text-[14px]"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={`flex items-center justify-end gap-2 justify-self-end ${DESKTOP_NAV}:gap-3`}>
          <a
            className={`hidden items-center gap-2 rounded-full bg-gradient-to-r from-[#1d4ed8] to-[#0ea5e9] px-5 py-3 text-sm font-semibold tracking-tight text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.55)] ring-1 ring-white/30 transition hover:brightness-105 hover:-translate-y-px ${DESKTOP_NAV}:inline-flex ${DESKTOP_NAV}:px-6 ${DESKTOP_NAV}:text-[15px]`}
            href={TEL}
          >
            <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            <span>Call {PHONE_DISPLAY}</span>
          </a>
          <button
            type="button"
            className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl text-slate-800 shadow-sm transition hover:bg-slate-50 ${DESKTOP_NAV}:hidden`}
            aria-expanded={open}
            aria-controls="shh-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      <div
        id="shh-mobile-nav"
        className={[
          `border-t border-slate-100 bg-white px-5 py-5 ${DESKTOP_NAV}:hidden`,
          open ? "block" : "hidden",
        ].join(" ")}
      >
        <nav className="flex max-h-[min(70vh,28rem)] flex-col gap-1 overflow-y-auto" aria-label="Mobile primary">
          {links.map((l) => (
            <Link
              key={`m-${l.href}-${l.label}`}
              href={l.href}
              className="rounded-xl px-4 py-3.5 text-base font-semibold text-slate-800 transition hover:bg-sky-50 hover:text-blue-800"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <a
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#1d4ed8] to-[#0ea5e9] px-5 py-4 text-base font-semibold text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.55)] ring-1 ring-white/30"
            href={TEL}
            onClick={() => setOpen(false)}
          >
            <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Call {PHONE_DISPLAY}
          </a>
        </nav>
      </div>
    </header>
  );
}
