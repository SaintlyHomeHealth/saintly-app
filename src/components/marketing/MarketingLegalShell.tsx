"use client";

import type { ReactNode } from "react";

import { MarketingFinalCtaStrip } from "./MarketingFinalCtaStrip";
import { MarketingSiteFooter } from "./MarketingSiteFooter";
import { MarketingSiteHeader } from "./MarketingSiteHeader";
import { MarketingStickyMobileCta } from "./MarketingStickyMobileCta";
import type { MarketingNavLink } from "./marketing-nav";
import "./marketing-home.css";

type MarketingLegalShellProps = {
  navLinks: readonly MarketingNavLink[];
  title: string;
  effectiveDateLabel: string;
  children: ReactNode;
};

export function MarketingLegalShell({ navLinks, title, effectiveDateLabel, children }: MarketingLegalShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div id="top" className="shh-home-page">
        <MarketingSiteHeader navLinks={navLinks} />

        <section className="shh-hero shh-hero--page" aria-labelledby="legal-doc-title">
          <div className="shh-hero-inner shh-hero-inner--single">
            <div className="shh-hero-heading">
              <div className="shh-pill">
                <span aria-hidden>✧</span>
                Legal
              </div>
              <h1 id="legal-doc-title">{title}</h1>
              <p className="shh-hero-sub">
                Effective Date: {effectiveDateLabel} · Company: Saintly Home Health LLC
              </p>
            </div>
          </div>
        </section>

        <div className="shh-legal-doc">{children}</div>

        <MarketingFinalCtaStrip />
        <MarketingSiteFooter />
      </div>

      <MarketingStickyMobileCta />
    </div>
  );
}
