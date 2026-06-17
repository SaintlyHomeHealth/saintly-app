import type { Metadata } from "next";
import { MarketingInsuranceAcceptedPage } from "@/components/marketing/MarketingInsuranceAcceptedPage";

export const metadata: Metadata = {
  title: { absolute: "Insurance & Plans We Accept | Saintly Home Health" },
  description:
    "Medicare, AHCCCS Medicaid, Medicare Advantage plans, and authorized network partners accepted by Saintly Home Health in Greater Phoenix. Verify eligibility before care begins.",
};

export default function InsuranceAcceptedPage() {
  return <MarketingInsuranceAcceptedPage />;
}
