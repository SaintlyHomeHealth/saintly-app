import type { Metadata } from "next";

import { LEGAL_EFFECTIVE_DATE_DISPLAY } from "@/components/marketing/marketing-constants";
import { SupportPageContent } from "@/components/marketing/legal/support-page-content";
import { MarketingLegalShell } from "@/components/marketing/MarketingLegalShell";
import { MARKETING_NAV_LEGAL_PAGE } from "@/components/marketing/marketing-nav";

export const metadata: Metadata = {
  title: "Support & Contact | Saintly Home Health",
  description:
    "Contact Saintly Home Health LLC for help with Saintly Phone, the staff workspace, calls, texting, and account access.",
};

export default function SupportPage() {
  return (
    <MarketingLegalShell
      navLinks={MARKETING_NAV_LEGAL_PAGE}
      title="Support & Contact"
      effectiveDateLabel={LEGAL_EFFECTIVE_DATE_DISPLAY}
    >
      <SupportPageContent />
    </MarketingLegalShell>
  );
}
