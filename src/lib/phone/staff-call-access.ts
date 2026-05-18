import type { SupabaseClient } from "@supabase/supabase-js";

import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility, isAssignedPhoneScopedStaff } from "@/lib/staff-profile";
import {
  loadStaffAssignedPhoneScope,
  phoneCallRowMatchesAssignedScope,
  type PhoneCallAssignedScopeRow,
  type StaffAssignedPhoneScope,
} from "@/lib/phone/staff-assigned-phone-scope";

/** Row shape used for visibility checks (subset of phone_calls). */
export type PhoneCallVisibilityRow = PhoneCallAssignedScopeRow & {
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
  row: PhoneCallVisibilityRow,
  assignedScope?: StaffAssignedPhoneScope | null
): boolean {
  if (hasFullCallVisibility(staff)) return true;
  if (isAssignedPhoneScopedStaff(staff)) {
    if (!assignedScope || (assignedScope.phoneNumberIds.length === 0 && assignedScope.e164s.length === 0)) {
      return false;
    }
    return phoneCallRowMatchesAssignedScope(row, assignedScope);
  }
  const o = row.owner_user_id;
  if (o != null && o !== "") return o === staff.user_id;
  return nurseCanSeePhoneCallRow(staff, row);
}

export async function canStaffAccessPhoneCallRowAsync(
  supabase: SupabaseClient,
  staff: StaffProfile,
  row: PhoneCallVisibilityRow
): Promise<boolean> {
  if (hasFullCallVisibility(staff)) return true;
  if (isAssignedPhoneScopedStaff(staff)) {
    const scope = await loadStaffAssignedPhoneScope(supabase, staff.user_id);
    return canStaffAccessPhoneCallRow(staff, row, scope);
  }
  return canStaffAccessPhoneCallRow(staff, row);
}

export const PHONE_CALL_STAFF_ACCESS_SELECT =
  "id, assigned_to_user_id, owner_user_id, from_e164, to_e164, twilio_phone_number_id";

export function mapPhoneCallStaffAccessRow(raw: Record<string, unknown>): PhoneCallVisibilityRow | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  return {
    assigned_to_user_id:
      typeof raw.assigned_to_user_id === "string" ? raw.assigned_to_user_id : null,
    owner_user_id: typeof raw.owner_user_id === "string" ? raw.owner_user_id : null,
    from_e164: typeof raw.from_e164 === "string" ? raw.from_e164 : null,
    to_e164: typeof raw.to_e164 === "string" ? raw.to_e164 : null,
    twilio_phone_number_id:
      typeof raw.twilio_phone_number_id === "string" ? raw.twilio_phone_number_id : null,
  };
}

/** Load call row via service client; enforce access with user-scoped client for assigned-line scope. */
export async function staffCanAccessPhoneCallId(
  userSupabase: SupabaseClient,
  staff: StaffProfile,
  adminSupabase: SupabaseClient,
  phoneCallId: string
): Promise<boolean> {
  const id = phoneCallId.trim();
  if (!id) return false;
  const { data, error } = await adminSupabase
    .from("phone_calls")
    .select(PHONE_CALL_STAFF_ACCESS_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return false;
  const row = mapPhoneCallStaffAccessRow(data as Record<string, unknown>);
  if (!row) return false;
  return canStaffAccessPhoneCallRowAsync(userSupabase, staff, row);
}

/** Claiming unassigned company-queue calls is restricted to org-wide visibility roles. */
export function canStaffClaimPhoneCall(
  staff: StaffProfile,
  row: PhoneCallVisibilityRow
): boolean {
  if (row.assigned_to_user_id != null) return false;
  return hasFullCallVisibility(staff);
}
