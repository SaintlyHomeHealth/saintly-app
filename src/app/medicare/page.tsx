import type { Metadata } from "next";
import { MarketingMedicarePage } from "@/components/marketing/MarketingMedicarePage";

export const metadata: Metadata = {
  title: { absolute: "Medicare & Coverage | Saintly Home Health" },
  description:
    "How Medicare home health coverage works in plain language — physician orders, eligibility, plan of care, and what Saintly Home Health helps with.",
};

export default function MedicarePage() {
  return <MarketingMedicarePage />;
}
