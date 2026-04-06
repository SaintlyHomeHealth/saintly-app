import type { Metadata } from "next";
import { MarketingAboutPage } from "@/components/marketing/MarketingAboutPage";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Medicare-certified Saintly Home Health—experienced clinicians, coordinated care, and compassionate home health in Greater Phoenix.",
};

export default function AboutPage() {
  return <MarketingAboutPage />;
}
