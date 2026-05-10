import type { Metadata } from "next";
import { MarketingSkilledNursingPage } from "@/components/marketing/MarketingSkilledNursingPage";

export const metadata: Metadata = {
  title: { absolute: "Skilled Nursing at Home | Saintly Home Health" },
  description:
    "Saintly Home Health provides skilled nursing at home — assessments, medication support, condition monitoring, wound oversight, and physician coordination across Greater Phoenix.",
};

export default function SkilledNursingPage() {
  return <MarketingSkilledNursingPage />;
}
