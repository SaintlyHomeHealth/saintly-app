import type { Metadata } from "next";
import { MarketingHome } from "@/components/marketing/MarketingHome";

export const metadata: Metadata = {
  title: "Saintly Home Health",
  description:
    "Care That Goes Above — Medicare-certified skilled nursing, wound care, therapy, and home health aide support in Greater Phoenix.",
};

export default function HomePage() {
  return <MarketingHome />;
}
