import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility } from "@/lib/staff-profile";

/** Admin call log: assigned to viewer or unassigned (company queue). */
export function phoneCallLogAdminScopeOrFilter(staff: StaffProfile): string {
  return `assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`;
}

/**
 * Workspace Calls tab: admin scope plus any inbound (shared line), so missed inbound assigned to
 * peers still appears; app filters are ANDed with RLS.
 */
export function phoneCallLogWorkspaceScopeOrFilter(staff: StaffProfile): string {
  return `assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null,direction.eq.inbound`;
}

export function applyPhoneCallLogScopeForStaff<Q extends { or: (filter: string) => Q }>(
  query: Q,
  staff: StaffProfile,
  variant: "admin" | "workspace"
): Q {
  if (hasFullCallVisibility(staff)) {
    return query;
  }
  const frag =
    variant === "admin" ? phoneCallLogAdminScopeOrFilter(staff) : phoneCallLogWorkspaceScopeOrFilter(staff);
  return query.or(frag);
}
