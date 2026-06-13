import {
  canAccessWorkspacePhone,
  isManagerOrHigher,
  type StaffProfile,
} from "@/lib/staff-profile";

/** Internal staff who may use global search (admin shell, CRM, or phone workspace). */
export function canAccessGlobalSearch(profile: StaffProfile | null | undefined): boolean {
  if (!profile || profile.is_active === false) return false;
  if (profile.role === "read_only" || profile.role === "sales_agent") return false;
  return isManagerOrHigher(profile) || profile.admin_shell_access === true || canAccessWorkspacePhone(profile);
}
