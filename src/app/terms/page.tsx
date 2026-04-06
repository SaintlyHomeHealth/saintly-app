import type { Metadata } from "next";

import { LEGAL_EFFECTIVE_DATE_DISPLAY } from "@/components/marketing/marketing-constants";
import { TermsOfServiceContent } from "@/components/marketing/legal/terms-of-service-content";
import { MarketingLegalShell } from "@/components/marketing/MarketingLegalShell";
import { MARKETING_NAV_LEGAL_PAGE } from "@/components/marketing/marketing-nav";

export const metadata: Metadata = {
  title: "Terms of Service | Saintly Home Health",
  description: "Terms of use for the Saintly Home Health LLC website and related communications.",
};

export default function TermsOfServicePage() {
  return (
    <MarketingLegalShell
      navLinks={MARKETING_NAV_LEGAL_PAGE}
      title="Terms of Service"
      effectiveDateLabel={LEGAL_EFFECTIVE_DATE_DISPLAY}
    >
      <TermsOfServiceContent />
    </MarketingLegalShell>
  );
}
