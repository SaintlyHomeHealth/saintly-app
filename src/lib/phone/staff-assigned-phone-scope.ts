import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StaffProfile } from "@/lib/staff-profile";
import { isAssignedPhoneScopedStaff } from "@/lib/staff-profile";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export type StaffAssignedPhoneScope = {
  phoneNumberIds: string[];
  e164s: string[];
};

export function normalizeStaffAssignedPhoneScopeE164(raw: string): string | null {
  const n = normalizeDialInputToE164(raw.trim());
  if (!n || !isValidE164(n)) return null;
  return n;
}

/**
 * Twilio numbers assigned to this auth user (`twilio_phone_numbers.status = assigned`).
 */
export async function loadStaffAssignedPhoneScope(
  supabase: SupabaseClient,
  userId: string
): Promise<StaffAssignedPhoneScope> {
  const uid = userId.trim();
  if (!uid) {
    return { phoneNumberIds: [], e164s: [] };
  }

  const { data, error } = await supabase
    .from("twilio_phone_numbers")
    .select("id, phone_number")
    .eq("assigned_user_id", uid)
    .eq("status", "assigned");

  if (error) {
    console.warn("[staff-assigned-phone-scope] load:", error.message);
    return { phoneNumberIds: [], e164s: [] };
  }

  const phoneNumberIds: string[] = [];
  const e164Set = new Set<string>();

  for (const row of data ?? []) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (id) phoneNumberIds.push(id);
    const pn = typeof row.phone_number === "string" ? normalizeStaffAssignedPhoneScopeE164(row.phone_number) : null;
    if (pn) e164Set.add(pn);
  }

  return { phoneNumberIds, e164s: [...e164Set] };
}

export function staffAssignedPhoneScopeHasLines(scope: StaffAssignedPhoneScope): boolean {
  return scope.phoneNumberIds.length > 0 || scope.e164s.length > 0;
}

/** PostgREST `.or()` filter for phone_calls rows tied to assigned lines. */
export function buildPhoneCallsAssignedScopeOrFilter(scope: StaffAssignedPhoneScope): string | null {
  const parts: string[] = [];
  if (scope.phoneNumberIds.length > 0) {
    parts.push(`twilio_phone_number_id.in.(${scope.phoneNumberIds.join(",")})`);
  }
  if (scope.e164s.length > 0) {
    const quoted = scope.e164s.map((e) => `"${e}"`).join(",");
    parts.push(`from_e164.in.(${quoted})`);
    parts.push(`to_e164.in.(${quoted})`);
  }
  if (parts.length === 0) return null;
  return parts.join(",");
}

export type PhoneCallAssignedScopeRow = {
  twilio_phone_number_id?: string | null;
  from_e164?: string | null;
  to_e164?: string | null;
};

export function phoneCallRowMatchesAssignedScope(
  row: PhoneCallAssignedScopeRow,
  scope: StaffAssignedPhoneScope
): boolean {
  const tid =
    row.twilio_phone_number_id != null && String(row.twilio_phone_number_id).trim() !== ""
      ? String(row.twilio_phone_number_id).trim()
      : null;
  if (tid && scope.phoneNumberIds.includes(tid)) return true;

  const from = row.from_e164 ? normalizeStaffAssignedPhoneScopeE164(row.from_e164) : null;
  const to = row.to_e164 ? normalizeStaffAssignedPhoneScopeE164(row.to_e164) : null;
  if (from && scope.e164s.includes(from)) return true;
  if (to && scope.e164s.includes(to)) return true;
  return false;
}

export type MessageAssignedScopeRow = {
  twilio_phone_number_id?: string | null;
  from_number?: string | null;
  to_number?: string | null;
};

export function messageRowMatchesAssignedScope(
  row: MessageAssignedScopeRow,
  scope: StaffAssignedPhoneScope
): boolean {
  const tid =
    row.twilio_phone_number_id != null && String(row.twilio_phone_number_id).trim() !== ""
      ? String(row.twilio_phone_number_id).trim()
      : null;
  if (tid && scope.phoneNumberIds.includes(tid)) return true;

  const from = row.from_number ? normalizeStaffAssignedPhoneScopeE164(row.from_number) : null;
  const to = row.to_number ? normalizeStaffAssignedPhoneScopeE164(row.to_number) : null;
  if (from && scope.e164s.includes(from)) return true;
  if (to && scope.e164s.includes(to)) return true;
  return false;
}

export function staffRequiresAssignedPhoneDataScope(staff: StaffProfile): boolean {
  return isAssignedPhoneScopedStaff(staff);
}
