import type { Metadata } from "next";
import { MarketingHomeHealthAidePage } from "@/components/marketing/MarketingHomeHealthAidePage";

export const metadata: Metadata = {
  /** Use absolute so the layout's "· Saintly Home Health" template doesn't duplicate the brand. */
  title: { absolute: "Home Health Aide Support at Home | Saintly Home Health" },
  description:
    "Saintly Home Health home health aides offer compassionate help with daily routines — bathing, dressing, meals, mobility, and companionship — right at home in Greater Phoenix.",
};

export default function HomeHealthAidePage() {
  return <MarketingHomeHealthAidePage />;
}
