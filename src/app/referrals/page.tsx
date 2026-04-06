import type { Metadata } from "next";
import { MarketingReferralsPage } from "@/components/marketing/MarketingReferralsPage";

export const metadata: Metadata = {
  title: "Referrals",
  description:
    "Refer patients to Saintly Home Health—fast intake, Medicare-certified skilled home health for Greater Phoenix partners.",
};

export default function ReferralsPage() {
  return <MarketingReferralsPage />;
}
