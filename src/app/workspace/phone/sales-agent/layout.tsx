import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { allowedWorkspaceTabHrefs, resolveEffectivePageAccess } from "@/lib/staff-page-access";
import { getStaffProfile, isSalesAgentRole } from "@/lib/staff-profile";

import { SalesAgentAppShell } from "./_components/SalesAgentAppShell";

export default async function SalesAgentSectionLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffProfile();
  if (!staff) {
    redirect("/login?next=/workspace/phone/sales-agent/leads");
  }
  if (!isSalesAgentRole(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  const displayName =
    (typeof staff.full_name === "string" && staff.full_name.trim()) ||
    (typeof staff.email === "string" && staff.email.trim()) ||
    "Sales Agent";

  const access = resolveEffectivePageAccess(staff);
  const allowedTabs = allowedWorkspaceTabHrefs(access);

  return (
    <SalesAgentAppShell displayName={displayName} allowedTabHrefs={allowedTabs}>
      {children}
    </SalesAgentAppShell>
  );
}
