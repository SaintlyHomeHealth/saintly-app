import type { Metadata } from "next";

import { EmploymentClientPage } from "./EmploymentClientPage";

export const metadata: Metadata = {
  title: "Careers | Saintly Home Health",
  description:
    "Join Saintly Home Health in Greater Phoenix—requirements for clinicians and caregivers, and how to apply.",
};

export default function EmploymentPage() {
  return <EmploymentClientPage />;
}
