import { redirect } from "next/navigation";

import { resolveEffectivePageAccess } from "@/lib/staff-page-access";
import { getStaffProfile, isSalesAgentRole, type StaffProfile } from "@/lib/staff-profile";
import { isSalesAgent, requireSalesAgent } from "@/lib/sales-agent/sales-agent-auth";
import { SALES_AGENT_ORDERS_BASE } from "@/lib/sales-agent/sales-agent-workspace-paths";

/** Redirects if caller lacks Sales Agent Orders page access. */
export async function requireSalesAgentOrdersAccess(): Promise<StaffProfile> {
  const staff = await requireSalesAgent();
  const access = resolveEffectivePageAccess(staff);
  if (!access.workspace_sales_agent_orders) {
    redirect("/unauthorized?reason=forbidden");
  }
  return staff;
}

/** Active sales agent profile for workspace phone shell (no orders-page gate). */
export async function requireSalesAgentWorkspaceShell(): Promise<StaffProfile> {
  const staff = await getStaffProfile();
  if (!staff) {
    redirect(`/login?next=${SALES_AGENT_ORDERS_BASE}`);
  }
  if (!isSalesAgent(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }
  return staff;
}

export function salesAgentHasAnyWorkspacePhoneAccess(
  staff: Pick<StaffProfile, "role" | "page_access_preset" | "page_permissions" | "admin_shell_access">
): boolean {
  if (!isSalesAgentRole(staff)) return false;
  const access = resolveEffectivePageAccess(staff);
  return (
    access.workspace_keypad ||
    access.workspace_calls ||
    access.workspace_voicemail ||
    access.workspace_sales_agent_orders
  );
}
