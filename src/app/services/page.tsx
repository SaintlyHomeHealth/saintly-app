import type { Metadata } from "next";
import { MarketingServicesPage } from "@/components/marketing/MarketingServicesPage";

export const metadata: Metadata = {
  title: "Home Health Services",
  description:
    "Skilled nursing, wound care, therapy, and more—Medicare-certified home health in Greater Phoenix.",
};

export default function ServicesPage() {
  return <MarketingServicesPage />;
}
