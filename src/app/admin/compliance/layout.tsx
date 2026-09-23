import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { canUseComplianceLogs } from "@/lib/compliance/access";
import { getStaffProfile } from "@/lib/staff-profile";

import "./compliance-print.css";

export const dynamic = "force-dynamic";

export default async function ComplianceLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffProfile();
  if (!canUseComplianceLogs(staff)) redirect("/admin");
  return children;
}
