import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { SALES_AGENT_ORDERS_BASE } from "@/lib/sales-agent/sales-agent-workspace-paths";
import { getStaffProfile, isSalesAgentRole } from "@/lib/staff-profile";

/** Legacy layout — routes redirect into Workspace Phone; keep auth gate for direct hits. */
export default async function SalesAgentLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffProfile();
  if (!staff) {
    redirect(`/login?next=${SALES_AGENT_ORDERS_BASE}`);
  }
  if (!isSalesAgentRole(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }
  return <>{children}</>;
}
