import type { Metadata } from "next";

import { LEGAL_EFFECTIVE_DATE_DISPLAY } from "@/components/marketing/marketing-constants";
import { SecurityNoticeContent } from "@/components/marketing/legal/security-notice-content";
import { MarketingLegalShell } from "@/components/marketing/MarketingLegalShell";
import { MARKETING_NAV_LEGAL_PAGE } from "@/components/marketing/marketing-nav";

export const metadata: Metadata = {
  title: "Security & HIPAA Practices | Saintly Home Health",
  description:
    "How Saintly Home Health LLC approaches security and protected health information in its communications and operations.",
};

export default function SecurityNoticePage() {
  return (
    <MarketingLegalShell
      navLinks={MARKETING_NAV_LEGAL_PAGE}
      title="Security & HIPAA Practices"
      effectiveDateLabel={LEGAL_EFFECTIVE_DATE_DISPLAY}
    >
      <SecurityNoticeContent />
    </MarketingLegalShell>
  );
}
