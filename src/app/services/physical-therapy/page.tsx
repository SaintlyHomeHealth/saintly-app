import type { Metadata } from "next";
import { MarketingPhysicalTherapyPage } from "@/components/marketing/MarketingPhysicalTherapyPage";

export const metadata: Metadata = {
  /** Use absolute so the layout's "· Saintly Home Health" template doesn't duplicate the brand. */
  title: { absolute: "Physical Therapy at Home | Saintly Home Health" },
  description:
    "Saintly Home Health provides in-home physical therapy to help patients improve strength, balance, mobility, and recovery safely at home.",
};

export default function PhysicalTherapyPage() {
  return <MarketingPhysicalTherapyPage />;
}
