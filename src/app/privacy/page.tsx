import type { Metadata } from "next";

import { LEGAL_EFFECTIVE_DATE_DISPLAY } from "@/components/marketing/marketing-constants";
import { PrivacyPolicyContent } from "@/components/marketing/legal/privacy-policy-content";
import { MarketingLegalShell } from "@/components/marketing/MarketingLegalShell";
import { MARKETING_NAV_LEGAL_PAGE } from "@/components/marketing/marketing-nav";

export const metadata: Metadata = {
  title: "Privacy Policy | Saintly Home Health",
  description:
    "How Saintly Home Health LLC collects, uses, and safeguards your information when you use our website and services.",
};

export default function PrivacyPolicyPage() {
  return (
    <MarketingLegalShell
      navLinks={MARKETING_NAV_LEGAL_PAGE}
      title="Privacy Policy"
      effectiveDateLabel={LEGAL_EFFECTIVE_DATE_DISPLAY}
    >
      <PrivacyPolicyContent />
    </MarketingLegalShell>
  );
}
