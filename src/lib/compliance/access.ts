import { isAdminOrHigher, type StaffProfile } from "@/lib/staff-profile";

const COMPLIANCE_ROLES = new Set(["super_admin", "admin", "manager", "don"]);

/** Office staff who complete the quarterly binder: admin, manager, and DON. */
export function canUseComplianceLogs(staff: StaffProfile | null | undefined): boolean {
  if (!staff || staff.is_active === false) return false;
  return COMPLIANCE_ROLES.has(staff.role);
}

/** Unlocking a finalized form is an admin action and is written to the change log. */
export function canUnlockCompliance(staff: StaffProfile | null | undefined): boolean {
  return isAdminOrHigher(staff);
}

export function staffDisplayName(staff: StaffProfile): string {
  const name = (staff.full_name ?? "").trim();
  if (name) return name;
  const email = (staff.email ?? "").trim();
  return email || "Staff";
}
