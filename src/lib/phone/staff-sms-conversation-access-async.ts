import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility, isAssignedPhoneScopedStaff } from "@/lib/staff-profile";
import {
  loadStaffAssignedPhoneScope,
  messageRowMatchesAssignedScope,
} from "@/lib/phone/staff-assigned-phone-scope";

/**
 * Server-side gate aligned with SMS conversation RLS: full visibility, assigned owner,
 * or at least one visible SMS row owned by this staff member.
 */
export async function staffMayAccessSmsConversation (
  supabase: SupabaseClient,
  staff: StaffProfile,
  conversationId: string,
  row: { assigned_to_user_id: string | null }
): Promise<boolean> {
  if (hasFullCallVisibility(staff)) return true;

  const cid = conversationId.trim();
  if (!cid) return false;

  if (isAssignedPhoneScopedStaff(staff)) {
    const scope = await loadStaffAssignedPhoneScope(supabase, staff.user_id);
    if (scope.e164s.length === 0 && scope.phoneNumberIds.length === 0) return false;

    const { data: msgs, error } = await supabase
      .from("messages")
      .select("id, twilio_phone_number_id, from_number, to_number")
      .eq("conversation_id", cid)
      .is("deleted_at", null)
      .limit(40);

    if (error) {
      console.warn("[staff-sms-access] assigned-line probe:", error.message);
      return false;
    }
    return (msgs ?? []).some((m) =>
      messageRowMatchesAssignedScope(
        {
          twilio_phone_number_id:
            typeof m.twilio_phone_number_id === "string" ? m.twilio_phone_number_id : null,
          from_number: typeof m.from_number === "string" ? m.from_number : null,
          to_number: typeof m.to_number === "string" ? m.to_number : null,
        },
        scope
      )
    );
  }

  const assigned =
    row.assigned_to_user_id != null && String(row.assigned_to_user_id).trim() !== ""
      ? String(row.assigned_to_user_id)
      : null;
  if (assigned === staff.user_id) return true;

  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", cid)
    .eq("owner_user_id", staff.user_id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[staff-sms-access] owner probe:", error.message);
    return false;
  }
  return Boolean(data?.id);
}
