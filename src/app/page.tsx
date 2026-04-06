import type { Metadata } from "next";
import { MarketingHome } from "@/components/marketing/MarketingHome";

export const metadata: Metadata = {
  title: "Saintly Home Health",
  description:
    "Medicare-certified home health in Greater Phoenix—skilled nursing, wound care, and therapy at home.",
};

export default function HomePage() {
  return <MarketingHome />;
}
