import type { Metadata } from "next";
import { MarketingContactPage } from "@/components/marketing/MarketingContactPage";

export const metadata: Metadata = {
  title: "Contact & Intake",
  description:
    "Talk to the Saintly Home Health intake team—phone, fax, email, and secure message. Greater Phoenix.",
};

export default function ContactPage() {
  return <MarketingContactPage />;
}
