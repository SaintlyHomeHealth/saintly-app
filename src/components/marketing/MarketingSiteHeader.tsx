'use client'

import Image from 'next/image'
import { useState } from 'react'

const LINKS = [
  { href: '#services', label: 'Services' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#coverage', label: 'Service area' },
  { href: '#intake', label: 'Contact' },
] as const

export function MarketingSiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="shh-site-header">
      <div className="shh-site-header-inner">
        <a className="shh-site-brand" href="#top">
          <Image
            src="/marketing/saintly-logo.png"
            alt=""
            width={40}
            height={40}
            priority
          />
          <span className="shh-site-brand-text">
            <strong>SAINTLY</strong>
            <span>HOME HEALTH</span>
          </span>
        </a>

        <nav className="shh-site-nav" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          <a className="shh-site-nav-cta" href="tel:+14803600008">
            Call (480) 360-0008
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
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </a>
        ))}
        <a
          className="shh-site-nav-cta"
          href="tel:+14803600008"
          onClick={() => setOpen(false)}
        >
          Call (480) 360-0008
        </a>
      </div>
    </header>
  )
}
