import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility } from "@/lib/staff-profile";

/** Row shape used for visibility checks (subset of phone_calls). */
export type PhoneCallVisibilityRow = {
  assigned_to_user_id: string | null;
};

export function nurseCanSeePhoneCallRow(
  staff: StaffProfile,
  row: PhoneCallVisibilityRow
): boolean {
  if (staff.role !== "nurse") return false;
  const a = row.assigned_to_user_id;
  return a === null || a === staff.user_id;
}

/**
 * Whether this staff member may view/act on this call in the phone workspace
 * (admin/manager: all; nurse: unassigned queue + own).
 */
export function canStaffAccessPhoneCallRow(
  staff: StaffProfile,
  row: PhoneCallVisibilityRow
): boolean {
  if (hasFullCallVisibility(staff)) return true;
  return nurseCanSeePhoneCallRow(staff, row);
}

/** Nurse may claim only when the call is still unassigned. */
export function canStaffClaimPhoneCall(
  staff: StaffProfile,
  row: PhoneCallVisibilityRow
): boolean {
  if (row.assigned_to_user_id != null) return false;
  if (hasFullCallVisibility(staff)) return true;
  return staff.role === "nurse";
}
