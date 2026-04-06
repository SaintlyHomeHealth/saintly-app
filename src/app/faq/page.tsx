import type { Metadata } from "next";
import { MarketingFaqPage } from "@/components/marketing/MarketingFaqPage";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers about Medicare home health, services at home, referrals, and getting started with Saintly Home Health in Greater Phoenix.",
};

export default function FaqPage() {
  return <MarketingFaqPage />;
}
