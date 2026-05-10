import type { Metadata } from "next";
import { MarketingWoundCarePage } from "@/components/marketing/MarketingWoundCarePage";

export const metadata: Metadata = {
  /** Use absolute so the layout's "· Saintly Home Health" template doesn't duplicate the brand. */
  title: { absolute: "Wound Care at Home in Arizona | Saintly Home Health" },
  description:
    "Saintly Home Health provides skilled nursing wound care at home in Arizona, including dressing changes, wound monitoring, patient education, and doctor coordination.",
};

export default function WoundCarePage() {
  return <MarketingWoundCarePage />;
}
