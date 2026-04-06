'use client'

import Image from 'next/image'
import { useState } from 'react'
import { PHONE_DISPLAY, TEL } from './marketing-constants'
import { MARKETING_NAV_DEFAULT, type MarketingNavLink } from './marketing-nav'

type MarketingSiteHeaderProps = {
  /** Defaults to sitewide marketing links (home + sections on `/`). */
  navLinks?: readonly MarketingNavLink[]
}

export function MarketingSiteHeader({ navLinks = MARKETING_NAV_DEFAULT }: MarketingSiteHeaderProps) {
  const [open, setOpen] = useState(false)
  const links = navLinks as MarketingNavLink[]

  return (
    <header className="shh-site-header">
      <div className="shh-site-header-inner">
        <a className="shh-site-brand" href="/">
          <Image
            src="/marketing/saintly-logo.png"
            alt=""
            width={1024}
            height={656}
            className="shh-site-brand-logo"
            priority
          />
          <span className="shh-site-brand-text">
            <strong>SAINTLY</strong>
            <span>HOME HEALTH</span>
          </span>
        </a>

        <nav className="shh-site-nav" aria-label="Primary">
          {links.map((l) => (
            <a key={l.href + l.label} href={l.href}>
              {l.label}
            </a>
          ))}
          <a className="shh-site-nav-cta" href={TEL}>
            Call {PHONE_DISPLAY}
          </a>
        </nav>

        <button
          type="button"
          className="shh-site-mobile-toggle"
          aria-expanded={open}
          aria-controls="shh-mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          {open ? '✕' : '☰'}
        </button>
      </div>

      <div
        id="shh-mobile-nav"
        className={['shh-site-mobile-panel', open ? 'is-open' : ''].join(' ')}
      >
        {links.map((l) => (
          <a
            key={l.href + l.label}
            href={l.href}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </a>
        ))}
        <a
          className="shh-site-nav-cta"
          href={TEL}
          onClick={() => setOpen(false)}
        >
          Call {PHONE_DISPLAY}
        </a>
      </div>
    </header>
  )
}
