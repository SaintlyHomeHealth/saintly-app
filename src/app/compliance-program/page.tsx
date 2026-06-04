import type { Metadata } from "next";

import { ComplianceProgramContent } from "@/components/marketing/legal/compliance-program-content";
import { MarketingLegalShell } from "@/components/marketing/MarketingLegalShell";
import { COMPLIANCE_PROGRAM_EFFECTIVE_DATE } from "@/lib/marketing/compliance-program-content-data";
import { MARKETING_NAV_LEGAL_PAGE } from "@/components/marketing/marketing-nav";

export const metadata: Metadata = {
  title: "Compliance Program | Saintly Home Health",
  description:
    "Saintly Home Health LLC corporate compliance program summary for patients, partners, payers, and workforce members.",
};

export default function ComplianceProgramPage() {
  return (
    <MarketingLegalShell
      navLinks={MARKETING_NAV_LEGAL_PAGE}
      title="Compliance Program"
      effectiveDateLabel={COMPLIANCE_PROGRAM_EFFECTIVE_DATE}
    >
      <ComplianceProgramContent />
    </MarketingLegalShell>
  );
}
