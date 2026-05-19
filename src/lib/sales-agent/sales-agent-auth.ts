import { redirect } from "next/navigation";

import { getStaffProfile, type StaffProfile } from "@/lib/staff-profile";

export function isSalesAgent(profile: StaffProfile | null | undefined): boolean {
  return profile?.role === "sales_agent" && profile.is_active !== false;
}

export function isSalesAgentOrCrmManager(profile: StaffProfile | null | undefined): boolean {
  if (!profile || profile.is_active === false) return false;
  const r = profile.role;
  return r === "sales_agent" || r === "manager" || r === "admin" || r === "super_admin";
}

/** Redirects to login/unauthorized if caller is not an active sales agent. */
export async function requireSalesAgent(): Promise<StaffProfile> {
  const staff = await getStaffProfile();
  if (!staff) {
    redirect("/login?next=/sales-agent/leads");
  }
  if (!isSalesAgent(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }
  return staff;
}

export function defaultPathForStaffRole(role: string): string {
  if (role === "sales_agent") return "/sales-agent/leads";
  return "/workspace/phone/keypad";
}