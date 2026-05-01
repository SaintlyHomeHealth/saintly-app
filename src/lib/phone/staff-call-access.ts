import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility } from "@/lib/staff-profile";

/** Row shape used for visibility checks (subset of phone_calls). */
export type PhoneCallVisibilityRow = {
  assigned_to_user_id: string | null;
  /** Snapshot owner at event time; preferred when present. */
  owner_user_id?: string | null;
};

export function nurseCanSeePhoneCallRow(
  staff: StaffProfile,
  row: PhoneCallVisibilityRow
): boolean {
  if (staff.role !== "nurse") return false;
  const o = row.owner_user_id;
  if (o != null && o !== "") return o === staff.user_id;
  const a = row.assigned_to_user_id;
  return a === staff.user_id;
}

/**
 * Whether this staff member may view/act on this call in the phone workspace
 * (admin/manager: all; nurse: rows they own or legacy assignment match).
 */
export function canStaffAccessPhoneCallRow(
  staff: StaffProfile,
  row: PhoneCallVisibilityRow
): boolean {
  if (hasFullCallVisibility(staff)) return true;
  const o = row.owner_user_id;
  if (o != null && o !== "") return o === staff.user_id;
  return nurseCanSeePhoneCallRow(staff, row);
}

/** Claiming unassigned company-queue calls is restricted to org-wide visibility roles. */
export function canStaffClaimPhoneCall(
  staff: StaffProfile,
  row: PhoneCallVisibilityRow
): boolean {
  if (row.assigned_to_user_id != null) return false;
  return hasFullCallVisibility(staff);
}
